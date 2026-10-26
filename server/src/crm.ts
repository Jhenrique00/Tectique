import express from 'express';
import type pg from 'pg';
import {z} from 'zod';
import {AppError} from './security.js';
import {audit,requireWorkspace} from './workspaces.js';

export const stages=['new','contacted','proposal','negotiation','won','lost'] as const;
const email=z.union([z.email().max(254),z.literal(''),z.null()]).transform(v=>v?v.toLowerCase():null);
export const contactInput=z.object({name:z.string().trim().min(2).max(120),email:email.default(null),phone:z.string().trim().max(40).default(''),company:z.string().trim().max(120).default(''),source:z.string().trim().max(80).default('Manual'),stage:z.enum(stages).default('new')}).strict();
export const captureInput=z.object({name:z.string().trim().min(2).max(120),email:z.email().max(254).transform(v=>v.toLowerCase()),phone:z.string().trim().max(40).optional(),company:z.string().trim().max(120).optional(),source:z.string().trim().max(80).optional()}).strict();
const page=z.object({limit:z.coerce.number().int().min(1).max(100).default(30),offset:z.coerce.number().int().min(0).max(1000000).default(0)});
const fields='id,workspace_id,name,email,phone,company,source,stage,archived,version,created_at,updated_at';
async function transaction<T>(pool:pg.Pool,fn:(c:pg.PoolClient)=>Promise<T>):Promise<T>{
  const c=await pool.connect();try{await c.query('BEGIN');const r=await fn(c);await c.query('COMMIT');return r;}catch(e:any){await c.query('ROLLBACK');if(e.code==='23505')throw new AppError(409,'Já existe um contato com esse e-mail neste workspace. Confira também os arquivados.');throw e;}finally{c.release();}
}
async function activity(c:pg.PoolClient,wid:string,id:string,user:string|null,kind:string,body:string){
  await c.query('INSERT INTO tectique_crm_activity(workspace_id,contact_id,user_id,kind,body) VALUES($1,$2,$3,$4,$5)',[wid,id,user,kind,body]);
}
export async function migrateCrm(c:pg.PoolClient){
  await c.query(`CREATE TABLE IF NOT EXISTS tectique_contacts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES tectique_workspaces(id) ON DELETE CASCADE,
    name text NOT NULL,email text,phone text NOT NULL DEFAULT '',company text NOT NULL DEFAULT '',source text NOT NULL DEFAULT 'Manual',
    stage text NOT NULL DEFAULT 'new' CHECK(stage IN ('new','contacted','proposal','negotiation','won','lost')),archived boolean NOT NULL DEFAULT false,
    version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,id))`);
  await c.query('CREATE UNIQUE INDEX IF NOT EXISTS tectique_contacts_email ON tectique_contacts(workspace_id,lower(email)) WHERE email IS NOT NULL');
  await c.query('CREATE INDEX IF NOT EXISTS tectique_contacts_list ON tectique_contacts(workspace_id,archived,updated_at DESC,id)');
  await c.query(`CREATE TABLE IF NOT EXISTS tectique_crm_activity (
    id bigserial PRIMARY KEY,workspace_id uuid NOT NULL,contact_id uuid NOT NULL,user_id uuid REFERENCES tectique_users(id) ON DELETE SET NULL,
    kind text NOT NULL,body text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY(workspace_id,contact_id) REFERENCES tectique_contacts(workspace_id,id) ON DELETE CASCADE)`);
  await c.query('CREATE INDEX IF NOT EXISTS tectique_crm_activity_contact ON tectique_crm_activity(workspace_id,contact_id,id DESC)');
  await c.query(`CREATE TABLE IF NOT EXISTS tectique_crm_tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,contact_id uuid NOT NULL,title text NOT NULL,due_at timestamptz,
    completed boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY(workspace_id,contact_id) REFERENCES tectique_contacts(workspace_id,id) ON DELETE CASCADE)`);
  await c.query('CREATE INDEX IF NOT EXISTS tectique_crm_tasks_list ON tectique_crm_tasks(workspace_id,completed,due_at,id)');
  await c.query('CREATE INDEX IF NOT EXISTS tectique_crm_tasks_contact ON tectique_crm_tasks(workspace_id,contact_id)');
  await c.query('INSERT INTO tectique_schema_versions(version) VALUES(5) ON CONFLICT DO NOTHING');
}
// Upsert do motor por e-mail, sob trava transacional. Não altera a etapa ou apaga campos ausentes.
export async function captureContact(pool:pg.Pool,wid:string,user:string|null,input:unknown){
  const d=captureInput.parse(input);
  return transaction(pool,async c=>{
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[wid+':'+d.email]);
    const found=await c.query('SELECT * FROM tectique_contacts WHERE workspace_id=$1 AND lower(email)=$2 FOR UPDATE',[wid,d.email]);
    if(found.rows[0]?.archived)throw new AppError(409,'O contato está arquivado. Restaure-o no CRM antes de atualizar por automação.');
    let contact:any,created=false;
    if(found.rows.length){
      const current=found.rows[0];
      const values=[d.name,d.phone??current.phone,d.company??current.company,d.source??current.source];
      if(JSON.stringify(values)===JSON.stringify([current.name,current.phone,current.company,current.source]))return {contact_id:current.id,name:current.name,email:current.email,stage:current.stage,created:false};
      contact=(await c.query(`UPDATE tectique_contacts SET name=$3,phone=$4,company=$5,source=$6,version=version+1,updated_at=now() WHERE workspace_id=$1 AND id=$2 RETURNING ${fields}`,[wid,current.id,...values])).rows[0];
    }else{
      created=true;contact=(await c.query(`INSERT INTO tectique_contacts(workspace_id,name,email,phone,company,source) VALUES($1,$2,$3,$4,$5,$6) RETURNING ${fields}`,[wid,d.name,d.email,d.phone??'',d.company??'',d.source??'Automação'])).rows[0];
    }
    await activity(c,wid,contact.id,user,created?'created':'updated',created?'Contato cadastrado por automação.':'Dados atualizados por automação.');
    await audit(c,wid,user,created?'crm.capture.create':'crm.capture.update',contact.id);
    return {contact_id:contact.id,name:contact.name,email:contact.email,stage:contact.stage,created};
  });
}
export function crmRouter(pool:pg.Pool,auth:express.RequestHandler){
  const r=express.Router(),base='/workspaces/:wid/crm';
  const W=(action:'read'|'write')=>[auth,requireWorkspace(pool,action)];
  r.get(base+'/summary',...W('read'),async(req,res)=>{
    const wid=req.workspace!.id;
    const counts=(await pool.query(`SELECT count(*) FILTER(WHERE NOT archived)::int AS total,count(*) FILTER(WHERE archived)::int AS archived,
      count(*) FILTER(WHERE NOT archived AND stage='won')::int AS won FROM tectique_contacts WHERE workspace_id=$1`,[wid])).rows[0];
    const task=(await pool.query(`SELECT count(*)::int AS pending,count(*) FILTER(WHERE due_at<now())::int AS overdue FROM tectique_crm_tasks t
      JOIN tectique_contacts c ON c.workspace_id=t.workspace_id AND c.id=t.contact_id WHERE t.workspace_id=$1 AND NOT t.completed AND NOT c.archived`,[wid])).rows[0];res.json({...counts,...task});
  });
  r.get(base+'/contacts',...W('read'),async(req,res)=>{
    const q=page.extend({q:z.string().trim().max(120).default(''),stage:z.enum(stages).optional(),archived:z.enum(['true','false']).default('false')}).parse(req.query);
    const values=[req.workspace!.id,q.archived==='true',q.stage??null,q.q];
    const where=`workspace_id=$1 AND archived=$2 AND ($3::text IS NULL OR stage=$3) AND ($4='' OR strpos(lower(name||' '||coalesce(email,'')||' '||phone||' '||company),lower($4))>0)`;
    const result=await pool.query(`SELECT ${fields},count(*) OVER()::int AS filtered_total FROM tectique_contacts WHERE ${where} ORDER BY updated_at DESC,id LIMIT $5 OFFSET $6`,[...values,q.limit,q.offset]);
    const total=result.rows[0]?.filtered_total??(await pool.query(`SELECT count(*)::int AS n FROM tectique_contacts WHERE ${where}`,values)).rows[0].n;
    res.json({items:result.rows,total,limit:q.limit,offset:q.offset});
  });
  r.post(base+'/contacts',...W('write'),async(req,res)=>{
    const d=contactInput.parse(req.body),wid=req.workspace!.id,user=req.account!.id;
    const contact=await transaction(pool,async c=>{
      const row=(await c.query(`INSERT INTO tectique_contacts(workspace_id,name,email,phone,company,source,stage) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING ${fields}`,[wid,d.name,d.email,d.phone,d.company,d.source,d.stage])).rows[0];
      await activity(c,wid,row.id,user,'created','Contato cadastrado.');await audit(c,wid,user,'crm.contact.create',row.id);return row;
    });res.status(201).json({contact});
  });
  r.get(base+'/contacts/:id',...W('read'),async(req,res)=>{
    const {rows}=await pool.query(`SELECT ${fields} FROM tectique_contacts WHERE workspace_id=$1 AND id=$2`,[req.workspace!.id,z.uuid().parse(req.params.id)]);
    if(!rows.length)throw new AppError(404,'Contato não encontrado.');res.json({contact:rows[0]});
  });
  r.patch(base+'/contacts/:id',...W('write'),async(req,res)=>{
    const d=contactInput.partial().extend({version:z.number().int().min(1),archived:z.boolean().optional()}).strict().parse(req.body),wid=req.workspace!.id,id=z.uuid().parse(req.params.id),user=req.account!.id;
    const contact=await transaction(pool,async c=>{
      const cur=(await c.query('SELECT * FROM tectique_contacts WHERE workspace_id=$1 AND id=$2 FOR UPDATE',[wid,id])).rows[0];
      if(!cur)throw new AppError(404,'Contato não encontrado.');if(cur.version!==d.version)throw new AppError(409,'Este contato mudou. Reabra os detalhes para carregar os dados atuais.');
      if(cur.archived&&d.archived!==false&&Object.keys(req.body).some(key=>!['version','archived'].includes(key)))throw new AppError(409,'Restaure o contato antes de editar os dados.');
      const next={...cur,...Object.fromEntries(Object.entries(d).filter(([key])=>Object.hasOwn(req.body,key)))};
      const row=(await c.query(`UPDATE tectique_contacts SET name=$3,email=$4,phone=$5,company=$6,source=$7,stage=$8,archived=$9,version=version+1,updated_at=now() WHERE workspace_id=$1 AND id=$2 RETURNING ${fields}`,[wid,id,next.name,next.email,next.phone,next.company,next.source,next.stage,next.archived])).rows[0];
      const kind=cur.archived!==next.archived?(next.archived?'archived':'restored'):cur.stage!==next.stage?'stage':'updated';
      const labels:Record<string,string>={new:'Novo',contacted:'Contato feito',proposal:'Proposta enviada',negotiation:'Negociação',won:'Fechado',lost:'Perdido'};
      const body=kind==='stage'?`Etapa: ${labels[cur.stage]} → ${labels[next.stage]}.`:kind==='archived'?'Contato arquivado.':kind==='restored'?'Contato restaurado.':'Dados do contato atualizados.';
      await activity(c,wid,id,user,kind,body);await audit(c,wid,user,'crm.contact.'+kind,id);return row;
    });res.json({contact});
  });
  r.get(base+'/contacts/:id/activity',...W('read'),async(req,res)=>{
    const wid=req.workspace!.id,id=z.uuid().parse(req.params.id),p=page.parse(req.query);
    if(!(await pool.query('SELECT 1 FROM tectique_contacts WHERE workspace_id=$1 AND id=$2',[wid,id])).rowCount)throw new AppError(404,'Contato não encontrado.');
    const {rows}=await pool.query(`SELECT a.id,a.kind,a.body,a.created_at,u.name AS user_name FROM tectique_crm_activity a LEFT JOIN tectique_users u ON u.id=a.user_id WHERE a.workspace_id=$1 AND a.contact_id=$2 ORDER BY a.id DESC LIMIT $3 OFFSET $4`,[wid,id,p.limit,p.offset]);
    const total=(await pool.query('SELECT count(*)::int AS n FROM tectique_crm_activity WHERE workspace_id=$1 AND contact_id=$2',[wid,id])).rows[0].n;res.json({items:rows,total});
  });
  r.post(base+'/contacts/:id/notes',...W('write'),async(req,res)=>{
    const body=z.object({body:z.string().trim().min(1).max(4000)}).strict().parse(req.body).body,wid=req.workspace!.id,id=z.uuid().parse(req.params.id);
    await transaction(pool,async c=>{
      const row=(await c.query('SELECT archived FROM tectique_contacts WHERE workspace_id=$1 AND id=$2 FOR UPDATE',[wid,id])).rows[0];
      if(!row)throw new AppError(404,'Contato não encontrado.');if(row.archived)throw new AppError(409,'Restaure o contato para registrar anotações.');
      await activity(c,wid,id,req.account!.id,'note',body);await audit(c,wid,req.account!.id,'crm.note.create',id);
    });res.status(201).json({ok:true});
  });
  r.get(base+'/tasks',...W('read'),async(req,res)=>{
    const p=page.extend({contact_id:z.uuid().optional(),completed:z.enum(['true','false','all']).default('false')}).parse(req.query),wid=req.workspace!.id;
    const values=[wid,p.contact_id??null,p.completed==='all'?null:p.completed==='true'];
    const where='t.workspace_id=$1 AND ($2::uuid IS NULL OR t.contact_id=$2) AND ($3::boolean IS NULL OR t.completed=$3) AND NOT c.archived';
    const join='FROM tectique_crm_tasks t JOIN tectique_contacts c ON c.workspace_id=t.workspace_id AND c.id=t.contact_id';
    const {rows}=await pool.query(`SELECT t.*,c.name AS contact_name ${join} WHERE ${where} ORDER BY t.completed,t.due_at NULLS LAST,t.id LIMIT $4 OFFSET $5`,[...values,p.limit,p.offset]);
    const total=(await pool.query(`SELECT count(*)::int AS n ${join} WHERE ${where}`,values)).rows[0].n;res.json({items:rows,total});
  });
  r.post(base+'/contacts/:id/tasks',...W('write'),async(req,res)=>{
    const d=z.object({title:z.string().trim().min(2).max(200),due_at:z.iso.datetime({offset:true}).nullable().default(null)}).strict().parse(req.body),wid=req.workspace!.id,id=z.uuid().parse(req.params.id);
    const task=await transaction(pool,async c=>{
      const row=(await c.query('SELECT archived FROM tectique_contacts WHERE workspace_id=$1 AND id=$2 FOR UPDATE',[wid,id])).rows[0];
      if(!row)throw new AppError(404,'Contato não encontrado.');if(row.archived)throw new AppError(409,'Restaure o contato para adicionar tarefas.');
      const task=(await c.query('INSERT INTO tectique_crm_tasks(workspace_id,contact_id,title,due_at) VALUES($1,$2,$3,$4) RETURNING *',[wid,id,d.title,d.due_at])).rows[0];
      await activity(c,wid,id,req.account!.id,'task','Tarefa criada: '+d.title);await audit(c,wid,req.account!.id,'crm.task.create',task.id);return task;
    });res.status(201).json({task});
  });
  r.patch(base+'/tasks/:id',...W('write'),async(req,res)=>{
    const d=z.object({completed:z.boolean(),version:z.number().int().min(1)}).strict().parse(req.body),wid=req.workspace!.id,id=z.uuid().parse(req.params.id);
    const task=await transaction(pool,async c=>{
      const row=(await c.query('SELECT t.*,c.archived FROM tectique_crm_tasks t JOIN tectique_contacts c ON c.workspace_id=t.workspace_id AND c.id=t.contact_id WHERE t.workspace_id=$1 AND t.id=$2 FOR UPDATE OF t,c',[wid,id])).rows[0];
      if(!row)throw new AppError(404,'Tarefa não encontrada.');if(row.archived)throw new AppError(409,'Restaure o contato para alterar a tarefa.');if(row.version!==d.version)throw new AppError(409,'A tarefa mudou. Atualize a lista.');
      const task=(await c.query('UPDATE tectique_crm_tasks SET completed=$3,version=version+1 WHERE workspace_id=$1 AND id=$2 RETURNING *',[wid,id,d.completed])).rows[0];
      await activity(c,wid,row.contact_id,req.account!.id,'task',(d.completed?'Tarefa concluída: ':'Tarefa reaberta: ')+row.title);await audit(c,wid,req.account!.id,'crm.task.update',id);return task;
    });res.json({task});
  });
  return r;
}
