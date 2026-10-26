import express from 'express';
import helmet from 'helmet';
import {rateLimit} from 'express-rate-limit';
import {z} from 'zod';
import type pg from 'pg';
import {githubReport,normalizeRepository} from './github.js';
import {AppError} from './security.js';
import {saveReport} from './db.js';
import {workspacesRouter,createWorkspace} from './workspaces.js';
import {flowsRouter} from './flows-api.js';
import {webhooksRouter} from './webhooks.js';
import {crmRouter} from './crm.js';
import {hashPassword,verifyPassword,issueSession,deleteSession,revokeCookie,requireAuth} from './auth.js';
const userInput=z.object({email:z.email().max(254).transform(e=>e.toLowerCase().trim()),password:z.string().min(8).max(128)});
const routineInput=z.object({repository:z.string().trim().min(3).max(250),days:z.union([z.literal(7),z.literal(30),z.literal(90)]),interval_hours:z.union([z.literal(1),z.literal(6),z.literal(12),z.literal(24)])});
const allowedOrigins=['http://127.0.0.1:5173','http://localhost:5173','http://127.0.0.1:4174','http://localhost:4174','http://127.0.0.1:8000','http://localhost:8000'];
export function createApp(pool:pg.Pool, reportService=githubReport, hooks:{nudge:()=>void}={nudge:()=>{}}) {
 const app=express();app.disable('x-powered-by');app.use(helmet());app.use(express.json({limit:'32kb'}));
 app.use('/api',(req,res,next)=>{
   if(req.headers.origin&&!allowedOrigins.includes(req.headers.origin)){res.status(403).json({detail:'Origem não permitida.'});return;}
   res.setHeader('Cache-Control','no-store');next();
 });
 app.use('/api',rateLimit({windowMs:60000,limit:120,standardHeaders:'draft-8',legacyHeaders:false,message:{detail:'Muitas solicitações. Aguarde um minuto.'}}));
 app.use('/api/auth',rateLimit({windowMs:15*60000,limit:25,standardHeaders:'draft-8',legacyHeaders:false,message:{detail:'Muitas tentativas. Aguarde alguns minutos.'}}));
 const auth=requireAuth(pool);
 app.get('/api/health',async (_req,res)=>{await pool.query('SELECT 1');res.json({status:'ok',version:'0.9.0',database:'postgresql'});});
 app.post('/api/auth/register',async(req,res)=>{
   const {email,password}=userInput.extend({name:z.string().trim().min(2).max(70)}).parse(req.body);
   const passwordHash=await hashPassword(password);
   const c=await pool.connect();
   let user:{id:string;name:string;email:string};
   try {
     await c.query('BEGIN');
     await c.query('SELECT pg_advisory_xact_lock(18422004)');
     const {rows}=await c.query('INSERT INTO tectique_users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id,name,email',[req.body.name.trim(),email,passwordHash]);
     user=rows[0];
     await createWorkspace(c,user.id,'Workspace de '+user.name);
     // Recover old single-user reports only for the FIRST registered local account.
     const count=await c.query('SELECT count(*)::integer AS total FROM tectique_users');
     if(count.rows[0].total===1)await c.query('UPDATE tectique_reports SET user_id=$1 WHERE user_id IS NULL',[user.id]);
     await c.query('COMMIT');
   }catch(e:any){await c.query('ROLLBACK');if(e?.code==='23505')throw new AppError(409,'Este e-mail já está cadastrado.');throw e;}
   finally{c.release();}
   await issueSession(pool,res,user!.id);res.status(201).json({user:user!});
 });
 app.post('/api/auth/login',async(req,res)=>{
   const {email,password}=userInput.parse(req.body);
   const {rows}=await pool.query('SELECT id,name,email,password_hash FROM tectique_users WHERE email=$1',[email]);
   if(!rows.length||!(await verifyPassword(password,rows[0].password_hash)))throw new AppError(401,'E-mail ou senha incorretos.');
   await issueSession(pool,res,rows[0].id);
   res.json({user:{id:rows[0].id,name:rows[0].name,email:rows[0].email}});
 });
 app.get('/api/auth/me',auth,(req,res)=>{res.json({user:req.account});});
 app.post('/api/auth/logout',auth,async(req,res)=>{await deleteSession(pool,req);revokeCookie(res);res.json({ok:true});});
 app.get('/api/github/summary',auth,async(req,res)=>{
   const {repository,days}=z.object({repository:z.string().trim().min(3).max(250),days:z.enum(['7','30','90']).default('30')}).parse(req.query);
   const report=await reportService(repository,Number(days));
   await saveReport(pool,report,req.account!.id);res.json(report);
 });
 app.get('/api/reports',auth,async(req,res)=>{
   const {limit,offset}=z.object({limit:z.coerce.number().int().min(1).max(100).default(20),offset:z.coerce.number().int().min(0).max(1000000).default(0)}).parse(req.query);
   const {rows}=await pool.query(`SELECT id,repository,days,generated_at,saved_at,report->>'summary' AS summary
      FROM tectique_reports WHERE user_id=$1 ORDER BY saved_at DESC,id DESC LIMIT $2 OFFSET $3`,[req.account!.id,limit,offset]);
   const count=await pool.query('SELECT count(*)::integer AS total FROM tectique_reports WHERE user_id=$1',[req.account!.id]);
   res.json({items:rows,total:count.rows[0].total,limit,offset});
 });
 app.get('/api/reports/:id',auth,async(req,res)=>{
   const id=z.uuid().parse(req.params.id);
   const {rows}=await pool.query('SELECT report FROM tectique_reports WHERE id=$1 AND user_id=$2',[id,req.account!.id]);
   if(!rows.length)throw new AppError(404,'Relatório não encontrado.');res.json(rows[0].report);
 });
 app.get('/api/routines',auth,async(req,res)=>{
   const {rows}=await pool.query(`SELECT id,repository,days,interval_hours,enabled,status,next_run_at,last_run_at,last_error,created_at
      FROM tectique_routines WHERE user_id=$1 ORDER BY created_at DESC,id DESC`,[req.account!.id]);
   res.json({items:rows});
 });
 app.post('/api/routines',auth,async(req,res)=>{
   const data=routineInput.parse(req.body);const repository=normalizeRepository(data.repository);
   const {rows}=await pool.query(`INSERT INTO tectique_routines(user_id,repository,days,interval_hours,next_run_at)
      VALUES($1,$2,$3,$4,now()+($4::integer*interval '1 hour'))
      RETURNING id,repository,days,interval_hours,enabled,status,next_run_at,last_run_at,last_error,created_at`,
      [req.account!.id,repository,data.days,data.interval_hours]);
   res.status(201).json({routine:rows[0]});
 });
 app.patch('/api/routines/:id',auth,async(req,res)=>{
   const id=z.uuid().parse(req.params.id);
   const {enabled}=z.object({enabled:z.boolean()}).strict().parse(req.body);
   const {rows}=await pool.query(`UPDATE tectique_routines SET enabled=$3,status=CASE WHEN $3 THEN 'waiting' ELSE 'paused' END,
      next_run_at=CASE WHEN $3 THEN now()+(interval_hours*interval '1 hour') ELSE NULL END,
      updated_at=now()
      WHERE id=$1 AND user_id=$2
      RETURNING id,repository,days,interval_hours,enabled,status,next_run_at,last_run_at,last_error,created_at`,[id,req.account!.id,enabled]);
   if(!rows.length)throw new AppError(404,'Rotina não encontrada.');res.json({routine:rows[0]});
 });
 app.post('/api/routines/:id/run',auth,async(req,res)=>{
   const id=z.uuid().parse(req.params.id);
   const {rows}=await pool.query(`UPDATE tectique_routines SET enabled=true,status='waiting',next_run_at=now(),
     updated_at=now() WHERE id=$1 AND user_id=$2
     RETURNING id,repository,days,interval_hours,enabled,status,next_run_at,last_run_at,last_error,created_at`,[id,req.account!.id]);
   if(!rows.length)throw new AppError(404,'Rotina não encontrada.');res.json({routine:rows[0]});
 });
 app.delete('/api/routines/:id',auth,async(req,res)=>{
   const id=z.uuid().parse(req.params.id);const {rowCount}=await pool.query('DELETE FROM tectique_routines WHERE id=$1 AND user_id=$2',[id,req.account!.id]);
   if(!rowCount)throw new AppError(404,'Rotina não encontrada.');res.status(204).end();
 });
 app.use('/api',workspacesRouter(pool,auth));
 app.use('/api',flowsRouter(pool,auth,hooks));
 app.use('/api',webhooksRouter(pool,auth,hooks));
 app.use('/api',crmRouter(pool,auth));
 app.use('/api',(_req,res)=>{res.status(404).json({detail:'Rota não encontrada.'});});
 app.use((err:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
   if(err?.type==='entity.too.large'){res.status(413).json({detail:'O corpo da solicitação excede 32 KB.'});return;}
   if(err?.type==='entity.parse.failed'){res.status(400).json({detail:'JSON inválido.'});return;}
   if(err instanceof z.ZodError){res.status(422).json({detail:'Dados inválidos. Confira os campos e tente novamente.'});return;}
   if(err instanceof AppError){res.status(err.status).json({detail:err.message});return;}
   console.error('Falha interna na API:',err?.code||err?.name||'Error');
   res.status(503).json({detail:'O servidor não concluiu a operação. Confira se o PostgreSQL está disponível.'});
 });
 return app;
}
