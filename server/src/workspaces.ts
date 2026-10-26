import express,{type Request,type Response,type NextFunction} from 'express';
import {z} from 'zod';
import type pg from 'pg';
import {AppError} from './security.js';

export type Role='owner'|'admin'|'member'|'viewer';
export type Action='read'|'write'|'run'|'credentials'|'members';
const RANK:Record<Role,number>={viewer:0,member:1,admin:2,owner:3};
const NEED:Record<Action,Role>={read:'viewer',write:'member',run:'member',credentials:'admin',members:'admin'};
declare global {namespace Express {interface Request {workspace?:{id:string;role:Role}}}}
export const can=(role:Role,action:Action)=>RANK[role]>=RANK[NEED[action]];

// Quem não pertence ao workspace recebe 404 (não revela que ele existe).
export function requireWorkspace(pool:pg.Pool,action:Action){
  return async(req:Request,_res:Response,next:NextFunction)=>{
    try{
      const wid=z.uuid().safeParse(req.params.wid);
      if(!wid.success)throw new AppError(404,'Workspace não encontrado.');
      const {rows}=await pool.query('SELECT role FROM tectique_workspace_members WHERE workspace_id=$1 AND user_id=$2',[wid.data,req.account!.id]);
      if(!rows.length)throw new AppError(404,'Workspace não encontrado.');
      if(!can(rows[0].role,action))throw new AppError(403,'Seu papel neste workspace não permite esta ação.');
      req.workspace={id:wid.data,role:rows[0].role};next();
    }catch(e){next(e);}
  };
}
export async function audit(db:{query:pg.Pool['query']},workspaceId:string,userId:string|null,action:string,target?:string,detail?:unknown){
  await db.query('INSERT INTO tectique_audit(workspace_id,user_id,action,target,detail) VALUES($1,$2,$3,$4,$5)',
    [workspaceId,userId,action,target??null,detail===undefined?null:JSON.stringify(detail)]);
}
export async function createWorkspace(db:{query:pg.Pool['query']},userId:string,name:string){
  const ws=await db.query('INSERT INTO tectique_workspaces(name,created_by) VALUES($1,$2) RETURNING id,name',[name,userId]);
  await db.query("INSERT INTO tectique_workspace_members(workspace_id,user_id,role) VALUES($1,$2,'owner')",[ws.rows[0].id,userId]);
  return ws.rows[0] as {id:string;name:string};
}

const roleSchema=z.enum(['owner','admin','member','viewer']);
export function workspacesRouter(pool:pg.Pool,auth:express.RequestHandler){
  const r=express.Router();
  r.get('/workspaces',auth,async(req,res)=>{
    const {rows}=await pool.query(`SELECT w.id,w.name,m.role,w.created_at FROM tectique_workspaces w JOIN tectique_workspace_members m ON m.workspace_id=w.id
      WHERE m.user_id=$1 ORDER BY w.created_at,w.id`,[req.account!.id]);
    res.json({items:rows});
  });
  r.post('/workspaces',auth,async(req,res)=>{
    const {name}=z.object({name:z.string().trim().min(2).max(70)}).parse(req.body);
    const c=await pool.connect();
    try{
      await c.query('BEGIN');const ws=await createWorkspace(c,req.account!.id,name);
      await audit(c,ws.id,req.account!.id,'workspace.create',ws.id);await c.query('COMMIT');
      res.status(201).json({workspace:{...ws,role:'owner'}});
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  });
  r.get('/workspaces/:wid/members',auth,requireWorkspace(pool,'read'),async(req,res)=>{
    const {rows}=await pool.query(`SELECT u.id,u.name,u.email,m.role,m.created_at FROM tectique_workspace_members m JOIN tectique_users u ON u.id=m.user_id
      WHERE m.workspace_id=$1 ORDER BY m.created_at,u.name`,[req.workspace!.id]);
    res.json({items:rows});
  });
  // Quem pode conceder/alterar: dono qualquer papel; administrador apenas "membro" e "leitor".
  const grantable=(caller:Role,role:Role)=>caller==='owner'||(caller==='admin'&&(role==='member'||role==='viewer'));
  r.post('/workspaces/:wid/members',auth,requireWorkspace(pool,'members'),async(req,res)=>{
    const {email,role}=z.object({email:z.email().max(254).transform(e=>e.toLowerCase().trim()),role:roleSchema}).parse(req.body);
    if(!grantable(req.workspace!.role,role))throw new AppError(403,'Seu papel não permite conceder este nível de acesso.');
    const user=await pool.query('SELECT id,name,email FROM tectique_users WHERE email=$1',[email]);
    if(!user.rows.length)throw new AppError(404,'Nenhuma conta com este e-mail. A pessoa precisa criar uma conta antes.');
    const ins=await pool.query('INSERT INTO tectique_workspace_members(workspace_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING user_id',[req.workspace!.id,user.rows[0].id,role]);
    if(!ins.rowCount)throw new AppError(409,'Esta pessoa já participa do workspace.');
    await audit(pool,req.workspace!.id,req.account!.id,'member.add',user.rows[0].id,{role});
    res.status(201).json({member:{...user.rows[0],role}});
  });
  async function changeMember(req:Request,res:Response,newRole:Role|null){
    const target=z.uuid().parse(req.params.userId),wid=req.workspace!.id,self=target===req.account!.id;
    const c=await pool.connect();
    try{
      await c.query('BEGIN');await c.query('SELECT id FROM tectique_workspaces WHERE id=$1 FOR UPDATE',[wid]);
      const cur=await c.query('SELECT role FROM tectique_workspace_members WHERE workspace_id=$1 AND user_id=$2',[wid,target]);
      if(!cur.rows.length)throw new AppError(404,'Membro não encontrado.');
      const caller=req.workspace!.role,current=cur.rows[0].role as Role;
      if(!(self&&newRole===null)){ // sair do próprio workspace é sempre permitido
        if(!can(caller,'members'))throw new AppError(403,'Seu papel neste workspace não permite esta ação.');
        if(caller!=='owner'&&RANK[current]>=RANK[caller])throw new AppError(403,'Você não pode alterar alguém com papel igual ou superior ao seu.');
        if(newRole&&!grantable(caller,newRole))throw new AppError(403,'Seu papel não permite conceder este nível de acesso.');
      }
      if(current==='owner'&&newRole!=='owner'){
        const owners=await c.query("SELECT count(*)::integer AS n FROM tectique_workspace_members WHERE workspace_id=$1 AND role='owner'",[wid]);
        if(owners.rows[0].n<=1)throw new AppError(409,'O workspace precisa ter pelo menos um dono.');
      }
      if(newRole)await c.query('UPDATE tectique_workspace_members SET role=$3 WHERE workspace_id=$1 AND user_id=$2',[wid,target,newRole]);
      else await c.query('DELETE FROM tectique_workspace_members WHERE workspace_id=$1 AND user_id=$2',[wid,target]);
      await audit(c,wid,req.account!.id,newRole?'member.role':'member.remove',target,newRole?{role:newRole}:undefined);
      await c.query('COMMIT');
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  }
  r.patch('/workspaces/:wid/members/:userId',auth,requireWorkspace(pool,'read'),async(req,res)=>{
    await changeMember(req,res,z.object({role:roleSchema}).strict().parse(req.body).role);res.json({ok:true});
  });
  r.delete('/workspaces/:wid/members/:userId',auth,requireWorkspace(pool,'read'),async(req,res)=>{await changeMember(req,res,null);res.status(204).end();});
  r.get('/workspaces/:wid/audit',auth,requireWorkspace(pool,'credentials'),async(req,res)=>{
    const {rows}=await pool.query(`SELECT a.id,a.action,a.target,a.detail,a.created_at,u.name AS user_name FROM tectique_audit a LEFT JOIN tectique_users u ON u.id=a.user_id
      WHERE a.workspace_id=$1 ORDER BY a.created_at DESC,a.id DESC LIMIT 100`,[req.workspace!.id]);
    res.json({items:rows});
  });
  return r;
}
