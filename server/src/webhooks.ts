import express from 'express';
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import type pg from 'pg';
import {AppError} from './security.js';
import {requireWorkspace,audit} from './workspaces.js';
import {enqueueRun} from './engine/executor.js';
import {redact} from './engine/secrets.js';
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
export function webhooksRouter(pool:pg.Pool,auth:express.RequestHandler,hooks:{nudge:()=>void}){
  const r=express.Router(),base='/workspaces/:wid/flows/:id/webhook';
  const manage=[auth,requireWorkspace(pool,'credentials')];
  r.get(base,...manage,async(req,res)=>{
    const id=z.uuid().parse(req.params.id);
    const {rows}=await pool.query('SELECT trigger_type,enabled,webhook_hash IS NOT NULL AS configured FROM tectique_flows WHERE workspace_id=$1 AND id=$2',[req.workspace!.id,id]);
    if(!rows.length)throw new AppError(404,'Fluxo não encontrado.');
    res.json({path:`/api/hooks/${id}`,enabled:rows[0].enabled&&rows[0].trigger_type==='webhook'&&rows[0].configured});
  });
  r.post(base,...manage,async(req,res)=>{
    const id=z.uuid().parse(req.params.id),token=randomBytes(32).toString('hex');
    const {rows}=await pool.query("UPDATE tectique_flows SET webhook_hash=$3,enabled=true,updated_at=now() WHERE workspace_id=$1 AND id=$2 AND trigger_type='webhook' RETURNING id",[req.workspace!.id,id,hash(token)]);
    if(!rows.length)throw new AppError(404,'Salve um fluxo com gatilho Webhook primeiro.');
    await audit(pool,req.workspace!.id,req.account!.id,'webhook.rotate',id);
    res.json({path:`/api/hooks/${id}`,token,enabled:true});
  });
  r.delete(base,...manage,async(req,res)=>{
    const id=z.uuid().parse(req.params.id);
    const {rowCount}=await pool.query('UPDATE tectique_flows SET webhook_hash=NULL,enabled=false,updated_at=now() WHERE workspace_id=$1 AND id=$2',[req.workspace!.id,id]);
    if(!rowCount)throw new AppError(404,'Fluxo não encontrado.');
    await audit(pool,req.workspace!.id,req.account!.id,'webhook.revoke',id);res.status(204).end();
  });
  r.post('/hooks/:id',async(req,res)=>{
    const parsed=z.uuid().safeParse(req.params.id);
    const authorization=req.get('Authorization')??'';
    if(!parsed.success||!/^Bearer [a-f0-9]{64}$/.test(authorization))throw new AppError(401,'Webhook indisponível ou token inválido.');
    const eventId=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/).parse(req.get('X-Tectique-Event-Id'));
    const payload=z.record(z.string(),z.unknown()).parse(req.body);
    const c=await pool.connect();
    try{
      await c.query('BEGIN');
      // Serializa eventos do mesmo fluxo: deduplicação e fila são gravadas juntas.
      const {rows}=await c.query('SELECT * FROM tectique_flows WHERE id=$1 FOR UPDATE',[parsed.data]);const f=rows[0];
      if(!f||!f.enabled||f.trigger_type!=='webhook'||!f.webhook_hash||!timingSafeEqual(Buffer.from(f.webhook_hash),Buffer.from(hash(authorization.slice(7)))))
        throw new AppError(401,'Webhook indisponível ou token inválido.');
      const prior=await c.query('SELECT run_id FROM tectique_webhook_events WHERE flow_id=$1 AND event_id=$2',[f.id,eventId]);
      if(prior.rows.length){await c.query('COMMIT');res.status(200).json({run:{id:prior.rows[0].run_id},duplicate:true});return;}
      const pending=await c.query("SELECT count(*)::int AS n FROM tectique_runs WHERE flow_id=$1 AND status IN ('queued','running')",[f.id]);
      if(pending.rows[0].n>=100)throw new AppError(429,'Fila deste webhook cheia. Tente mais tarde com o mesmo identificador de evento.');
      const run=await enqueueRun(c,{workspaceId:f.workspace_id,flowId:f.id,flowName:f.name,flowVersion:f.version,definition:f.definition,
        triggerType:'webhook',payload:redact(payload),userId:f.created_by});
      await c.query('INSERT INTO tectique_webhook_events(flow_id,event_id,run_id) VALUES($1,$2,$3)',[f.id,eventId,run.id]);
      await c.query('COMMIT');hooks.nudge();res.status(202).json({run,duplicate:false});
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  });
  return r;
}
