import express from 'express';
import {parseConnection} from './engine/connections.js';
import {z} from 'zod';
import type pg from 'pg';
import {AppError} from './security.js';
import {normalizeRepository} from './github.js';
import {audit,requireWorkspace} from './workspaces.js';
import {listBlocks} from './engine/blocks.js';
import {templates,validateDefinition} from './engine/definition.js';
import {enqueueRetry,enqueueRun} from './engine/executor.js';
import {encryptSecret} from './engine/secrets.js';

const FLOW_COLUMNS='id,workspace_id,name,description,version,trigger_type,schedule_hours,enabled,next_run_at,created_at,updated_at';
const RUN_COLUMNS='id,flow_id,flow_name,flow_version,trigger_type,status,error,retry_of,queued_at,started_at,finished_at';

export function flowsRouter(pool:pg.Pool,auth:express.RequestHandler,hooks:{nudge:()=>void}){
  const r=express.Router();
  const W=(action:Parameters<typeof requireWorkspace>[1])=>[auth,requireWorkspace(pool,action)];
  const invalid=(res:express.Response,errors:string[])=>res.status(422).json({detail:'O fluxo contém erros e não foi salvo.',errors});

  r.get('/blocks',auth,(_req,res)=>{res.json({items:listBlocks()});});
  r.get('/templates',auth,(_req,res)=>{res.json({items:templates.map(({build:_b,...t})=>t)});});

  // ---- Fluxos ----
  r.get('/workspaces/:wid/flows',...W('read'),async(req,res)=>{
    const {rows}=await pool.query(`SELECT ${FLOW_COLUMNS} FROM tectique_flows WHERE workspace_id=$1 ORDER BY created_at DESC,id DESC`,[req.workspace!.id]);
    res.json({items:rows});
  });
  r.post('/workspaces/:wid/flows/validate',...W('read'),(req,res)=>{
    const v=validateDefinition(req.body?.definition);res.json({ok:v.ok,errors:v.errors});
  });
  r.post('/workspaces/:wid/flows',...W('write'),async(req,res)=>{
    const {name,description,definition}=z.object({name:z.string().trim().min(1).max(80),description:z.string().trim().max(500).default(''),definition:z.any()}).parse(req.body);
    const v=validateDefinition(definition);if(!v.ok)return void invalid(res,v.errors);
    const {rows}=await pool.query(`INSERT INTO tectique_flows(workspace_id,name,description,definition,trigger_type,schedule_hours,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING ${FLOW_COLUMNS}`,[req.workspace!.id,name,description,JSON.stringify(v.definition),v.triggerType,v.scheduleHours,req.account!.id]);
    await audit(pool,req.workspace!.id,req.account!.id,'flow.create',rows[0].id);
    res.status(201).json({flow:rows[0]});
  });
  r.post('/workspaces/:wid/flows/from-template',...W('write'),async(req,res)=>{
    const input=z.object({template:z.string(),name:z.string().trim().min(1).max(80).optional(),params:z.record(z.string(),z.any()).default({})}).parse(req.body);
    const tpl=templates.find(t=>t.id===input.template);if(!tpl)throw new AppError(404,'Modelo não encontrado.');
    for(const p of tpl.params)if(p.required&&(input.params[p.key]==null||input.params[p.key]===''))throw new AppError(422,`Preencha: ${p.label}.`);
    if(tpl.id==='github-analytics')input.params.repository=normalizeRepository(String(input.params.repository));
    const v=validateDefinition(tpl.build(input.params));if(!v.ok)return void invalid(res,v.errors);
    const {rows}=await pool.query(`INSERT INTO tectique_flows(workspace_id,name,description,definition,trigger_type,schedule_hours,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING ${FLOW_COLUMNS}`,[req.workspace!.id,input.name??`${tpl.name} — ${input.params.repository??''}`.trim(),tpl.description,
      JSON.stringify(v.definition),v.triggerType,v.scheduleHours,req.account!.id]);
    await audit(pool,req.workspace!.id,req.account!.id,'flow.create',rows[0].id,{template:tpl.id});
    res.status(201).json({flow:rows[0]});
  });
  r.get('/workspaces/:wid/flows/:id',...W('read'),async(req,res)=>{
    const id=z.uuid().parse(req.params.id);
    const {rows}=await pool.query(`SELECT ${FLOW_COLUMNS},definition FROM tectique_flows WHERE id=$1 AND workspace_id=$2`,[id,req.workspace!.id]);
    if(!rows.length)throw new AppError(404,'Fluxo não encontrado.');res.json({flow:rows[0]});
  });
  r.put('/workspaces/:wid/flows/:id',...W('write'),async(req,res)=>{
    const id=z.uuid().parse(req.params.id);
    const body=z.object({name:z.string().trim().min(1).max(80).optional(),description:z.string().trim().max(500).optional(),definition:z.any().optional()}).parse(req.body);
    const v=body.definition===undefined?null:validateDefinition(body.definition);
    if(v&&!v.ok)return void invalid(res,v.errors);
    const {rows}=await pool.query(`UPDATE tectique_flows SET name=COALESCE($3::text,name),description=COALESCE($4::text,description),
      definition=COALESCE($5::jsonb,definition),version=CASE WHEN $5::jsonb IS NULL THEN version ELSE version+1 END,
      webhook_hash=CASE WHEN $6::text IS NOT NULL AND $6::text<>trigger_type THEN NULL ELSE webhook_hash END,
      enabled=CASE WHEN $6::text='webhook' AND trigger_type<>'webhook' THEN false ELSE enabled END,
      trigger_type=COALESCE($6::text,trigger_type),schedule_hours=CASE WHEN $5::jsonb IS NULL THEN schedule_hours ELSE $7::integer END,
      next_run_at=CASE WHEN $5::jsonb IS NULL THEN next_run_at WHEN enabled AND COALESCE($6::text,trigger_type)='schedule' THEN now()+($7::integer*interval '1 hour') ELSE NULL END,
      updated_at=now() WHERE id=$1 AND workspace_id=$2 RETURNING ${FLOW_COLUMNS}`,
      [id,req.workspace!.id,body.name??null,body.description??null,v?JSON.stringify(v.definition):null,v?.triggerType??null,v?.scheduleHours??null]);
    if(!rows.length)throw new AppError(404,'Fluxo não encontrado.');
    await audit(pool,req.workspace!.id,req.account!.id,'flow.update',id);res.json({flow:rows[0]});
  });
  // "enabled" controla apenas execuções AUTOMÁTICAS (agendamento). Execução manual/teste funciona mesmo pausado.
  r.patch('/workspaces/:wid/flows/:id',...W('write'),async(req,res)=>{
    const id=z.uuid().parse(req.params.id),{enabled}=z.object({enabled:z.boolean()}).strict().parse(req.body);
    const {rows}=await pool.query(`UPDATE tectique_flows SET enabled=CASE WHEN trigger_type='webhook' AND webhook_hash IS NULL THEN false ELSE $3 END,next_run_at=CASE WHEN $3::boolean AND trigger_type='schedule' THEN now()+(schedule_hours*interval '1 hour') ELSE NULL END,
      updated_at=now() WHERE id=$1 AND workspace_id=$2 RETURNING ${FLOW_COLUMNS}`,[id,req.workspace!.id,enabled]);
    if(!rows.length)throw new AppError(404,'Fluxo não encontrado.');
    if(enabled&&!rows[0].enabled)throw new AppError(409,'Peça a um administrador para gerar o token do webhook no Criador de fluxos.');
    await audit(pool,req.workspace!.id,req.account!.id,enabled?'flow.enable':'flow.pause',id);res.json({flow:rows[0]});
  });
  r.delete('/workspaces/:wid/flows/:id',...W('write'),async(req,res)=>{
    const id=z.uuid().parse(req.params.id);
    const {rowCount}=await pool.query('DELETE FROM tectique_flows WHERE id=$1 AND workspace_id=$2',[id,req.workspace!.id]);
    if(!rowCount)throw new AppError(404,'Fluxo não encontrado.');
    await audit(pool,req.workspace!.id,req.account!.id,'flow.delete',id);res.status(204).end();
  });
  r.post('/workspaces/:wid/flows/:id/run',...W('run'),async(req,res)=>{
    const id=z.uuid().parse(req.params.id),{payload}=z.object({payload:z.record(z.string(),z.any()).default({})}).parse(req.body??{});
    const {rows}=await pool.query('SELECT id,name,version,definition FROM tectique_flows WHERE id=$1 AND workspace_id=$2',[id,req.workspace!.id]);
    if(!rows.length)throw new AppError(404,'Fluxo não encontrado.');
    const run=await enqueueRun(pool,{workspaceId:req.workspace!.id,flowId:id,flowName:rows[0].name,flowVersion:rows[0].version,definition:rows[0].definition,
      triggerType:'manual',payload,userId:req.account!.id});
    await audit(pool,req.workspace!.id,req.account!.id,'run.start',run.id,{flow:id});
    hooks.nudge();res.status(202).json({run});
  });

  // ---- Execuções ----
  r.get('/workspaces/:wid/runs',...W('read'),async(req,res)=>{
    const q=z.object({flow_id:z.uuid().optional(),status:z.enum(['queued','running','succeeded','failed','cancelled']).optional(),
      limit:z.coerce.number().int().min(1).max(100).default(20),offset:z.coerce.number().int().min(0).max(1000000).default(0)}).parse(req.query);
    const where='workspace_id=$1 AND ($2::uuid IS NULL OR flow_id=$2) AND ($3::text IS NULL OR status=$3)';
    const args=[req.workspace!.id,q.flow_id??null,q.status??null];
    const {rows}=await pool.query(`SELECT ${RUN_COLUMNS} FROM tectique_runs WHERE ${where} ORDER BY queued_at DESC,id DESC LIMIT $4 OFFSET $5`,[...args,q.limit,q.offset]);
    const total=await pool.query(`SELECT count(*)::integer AS total FROM tectique_runs WHERE ${where}`,args);
    res.json({items:rows,total:total.rows[0].total,limit:q.limit,offset:q.offset});
  });
  r.get('/workspaces/:wid/runs/:id',...W('read'),async(req,res)=>{
    const id=z.uuid().parse(req.params.id);
    const run=await pool.query(`SELECT ${RUN_COLUMNS},definition,trigger_payload FROM tectique_runs WHERE id=$1 AND workspace_id=$2`,[id,req.workspace!.id]);
    if(!run.rows.length)throw new AppError(404,'Execução não encontrada.');
    const steps=await pool.query('SELECT id,node_id,node_type,status,input,output,branch,error,started_at,finished_at FROM tectique_run_steps WHERE run_id=$1 ORDER BY started_at,id',[id]);
    res.json({run:run.rows[0],steps:steps.rows});
  });
  r.post('/workspaces/:wid/runs/:id/retry',...W('run'),async(req,res)=>{
    const id=z.uuid().parse(req.params.id);
    const {rows}=await pool.query('SELECT * FROM tectique_runs WHERE id=$1 AND workspace_id=$2',[id,req.workspace!.id]);
    if(!rows.length)throw new AppError(404,'Execução não encontrada.');
    if(rows[0].status!=='failed')throw new AppError(409,'Só é possível tentar novamente uma execução que falhou.');
    const run=await enqueueRetry(pool,rows[0],req.account!.id);
    await audit(pool,req.workspace!.id,req.account!.id,'run.retry',run.id,{of:id});
    hooks.nudge();res.status(202).json({run});
  });
  r.post('/workspaces/:wid/runs/:id/cancel',...W('run'),async(req,res)=>{
    const id=z.uuid().parse(req.params.id);
    const {rows}=await pool.query("UPDATE tectique_runs SET status='cancelled',finished_at=now(),error='Cancelada pelo usuário.' WHERE id=$1 AND workspace_id=$2 AND status='queued' RETURNING id",[id,req.workspace!.id]);
    if(!rows.length)throw new AppError(409,'Só é possível cancelar execuções que ainda estão na fila.');
    await audit(pool,req.workspace!.id,req.account!.id,'run.cancel',id);res.json({ok:true});
  });

  // ---- Credenciais: o segredo nunca volta pela API ----
  r.get('/workspaces/:wid/credentials',...W('credentials'),async(req,res)=>{
    const {rows}=await pool.query('SELECT id,name,kind,created_at FROM tectique_credentials WHERE workspace_id=$1 ORDER BY name',[req.workspace!.id]);
    res.json({items:rows});
  });
  r.post('/workspaces/:wid/credentials',...W('credentials'),async(req,res)=>{
    const {name,kind,secret}=z.object({name:z.string().trim().regex(/^[A-Za-z0-9 _.-]{1,60}$/,'Nome inválido.'),kind:z.enum(['api_key','token','password','http','smtp']),secret:z.string().min(1).max(4096)}).parse(req.body);
    if(kind==='http'||kind==='smtp'){try{parseConnection(kind,secret);}catch(e){throw new AppError(422,(e as Error).message);}}
    const {rows}=await pool.query('INSERT INTO tectique_credentials(workspace_id,name,kind,ciphertext,created_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id,name,kind,created_at',
      [req.workspace!.id,name,kind,encryptSecret(secret,req.workspace!.id),req.account!.id]);
    if(!rows.length)throw new AppError(409,'Já existe uma credencial com este nome.');
    await audit(pool,req.workspace!.id,req.account!.id,'credential.create',rows[0].id,{name,kind});
    res.status(201).json({credential:rows[0]});
  });
  r.delete('/workspaces/:wid/credentials/:id',...W('credentials'),async(req,res)=>{
    const id=z.uuid().parse(req.params.id);
    const {rows}=await pool.query('DELETE FROM tectique_credentials WHERE id=$1 AND workspace_id=$2 RETURNING name',[id,req.workspace!.id]);
    if(!rows.length)throw new AppError(404,'Credencial não encontrada.');
    await audit(pool,req.workspace!.id,req.account!.id,'credential.delete',id,{name:rows[0].name});res.status(204).end();
  });
  return r;
}
