import type pg from 'pg';
import {ZodError} from 'zod';
import {getBlock,resolveTemplates,type BlockContext} from './blocks.js';
import {executionOrder,type Definition} from './definition.js';
import {decryptSecret,redact} from './secrets.js';
import type {ReportService} from '../scheduler.js';

export interface Services{reportService:ReportService}
const MAX_OUTPUT_BYTES=256_000;
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));

export async function enqueueRun(pool:Pick<pg.Pool,'query'>,o:{workspaceId:string;flowId:string|null;flowName:string;flowVersion:number;definition:Definition;
  triggerType:'manual'|'schedule'|'retry'|'webhook';payload?:unknown;userId:string|null;retryOf?:string;seed?:unknown}){
  const {rows}=await pool.query(`INSERT INTO tectique_runs(workspace_id,flow_id,flow_name,flow_version,definition,trigger_type,trigger_payload,seed,retry_of,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,status,queued_at`,
    [o.workspaceId,o.flowId,o.flowName,o.flowVersion,JSON.stringify(o.definition),o.triggerType,JSON.stringify(o.payload??{}),
     o.seed?JSON.stringify(o.seed):null,o.retryOf??null,o.userId]);
  return rows[0] as {id:string;status:string;queued_at:string};
}

// Nova tentativa: reaproveita a saída das etapas que já tiveram sucesso e recomeça a partir da que falhou.
export async function enqueueRetry(pool:pg.Pool,original:any,userId:string){
  const {rows}=await pool.query("SELECT node_id,node_type,output,branch FROM tectique_run_steps WHERE run_id=$1 AND status IN ('succeeded','reused')",[original.id]);
  const seed:Record<string,{output:unknown;branch?:string}>={};
  for(const s of rows)if(!String(s.node_type).startsWith('trigger.'))seed[s.node_id]={output:s.output,branch:s.branch??undefined};
  return enqueueRun(pool,{workspaceId:original.workspace_id,flowId:original.flow_id,flowName:original.flow_name,flowVersion:original.flow_version,
    definition:original.definition,triggerType:'retry',payload:original.trigger_payload,userId,retryOf:original.id,seed});
}

// Execuções que perderam o "lease" (servidor caiu ou travou) NÃO são repetidas sozinhas: efeitos externos
// poderiam duplicar. Ficam como falhas e o usuário decide se usa "Tentar novamente".
export async function recoverStale(pool:pg.Pool){
  await pool.query(`WITH stale AS (UPDATE tectique_runs SET status='failed',finished_at=now(),lease_until=NULL,
      error='Execução interrompida (o servidor foi reiniciado ou parou de responder). Use "Tentar novamente".'
      WHERE status='running' AND lease_until<now() RETURNING id)
    UPDATE tectique_run_steps SET status='failed',error='Interrompida.',finished_at=now() WHERE status='running' AND run_id IN (SELECT id FROM stale)`);
}

// Fluxos agendados viram execuções na fila de forma atômica (um único comando): sem duplicar nem perder disparos.
export async function enqueueDueFlows(pool:pg.Pool){
  await pool.query(`WITH due AS (
      SELECT f.id FROM tectique_flows f WHERE f.enabled AND f.trigger_type='schedule' AND f.next_run_at<=now()
      AND NOT EXISTS (SELECT 1 FROM tectique_runs r WHERE r.flow_id=f.id AND r.status IN ('queued','running'))
      ORDER BY f.next_run_at,f.id FOR UPDATE SKIP LOCKED LIMIT 20),
    upd AS (UPDATE tectique_flows f SET next_run_at=now()+(f.schedule_hours*interval '1 hour') FROM due WHERE f.id=due.id
      RETURNING f.id,f.workspace_id,f.name,f.version,f.definition,f.created_by)
    INSERT INTO tectique_runs(workspace_id,flow_id,flow_name,flow_version,definition,trigger_type,trigger_payload,created_by)
    SELECT workspace_id,id,name,version,definition,'schedule','{}'::jsonb,created_by FROM upd`);
}

export async function claimRun(pool:pg.Pool){
  const {rows}=await pool.query(`WITH next AS (SELECT id FROM tectique_runs WHERE status='queued' ORDER BY queued_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
    UPDATE tectique_runs r SET status='running',started_at=now(),lease_until=now()+interval '2 minutes' FROM next WHERE r.id=next.id RETURNING r.*`);
  return rows[0] as any|undefined;
}

function describe(e:unknown):string{
  if(e instanceof ZodError)return 'Configuração inválida — '+e.issues.map(i=>`${i.path.join('.')||'campo'}: ${i.message}`).join('; ');
  return e instanceof Error?e.message:'Falha desconhecida.';
}

export async function processRun(pool:pg.Pool,run:any,services:Services){
  const def:Definition=run.definition,nodes=new Map(def.nodes.map(n=>[n.id,n]));
  const status:Record<string,string>={},branch:Record<string,string|undefined>={},known=new Set<string>();
  const scope:{trigger:any;steps:Record<string,{output:unknown}>}={trigger:run.trigger_payload??{},steps:{}};
  const seed:Record<string,{output:unknown;branch?:string}>=run.seed??{};
  let failure:string|null=null;
  try{
    for(const id of executionOrder(def)){
      const node=nodes.get(id)!,block=getBlock(node.type);
      const isTrigger=node.type.startsWith('trigger.');
      const active=isTrigger||def.edges.some(e=>e.to===id&&['succeeded','reused'].includes(status[e.from])&&(!e.branch||branch[e.from]===e.branch));
      if(!active){
        await pool.query("INSERT INTO tectique_run_steps(run_id,node_id,node_type,status,finished_at) VALUES($1,$2,$3,'skipped',now())",[run.id,id,node.type]);
        status[id]='skipped';continue;
      }
      await pool.query("UPDATE tectique_runs SET lease_until=now()+interval '2 minutes' WHERE id=$1",[run.id]);
      if(!isTrigger&&seed[id]){
        scope.steps[id]={output:seed[id].output};branch[id]=seed[id].branch;status[id]='reused';
        await pool.query("INSERT INTO tectique_run_steps(run_id,node_id,node_type,status,output,branch,finished_at) VALUES($1,$2,$3,'reused',$4,$5,now())",
          [run.id,id,node.type,JSON.stringify(seed[id].output??null),seed[id].branch??null]);
        continue;
      }
      const step=await pool.query("INSERT INTO tectique_run_steps(run_id,node_id,node_type,status) VALUES($1,$2,$3,'running') RETURNING id",[run.id,id,node.type]);
      const stepId=step.rows[0].id;
      const controller=new AbortController();
      let timer:NodeJS.Timeout|undefined;
      try{
        if(!block)throw new Error(`Tipo de bloco desconhecido: ${node.type}.`);
        const config=block.schema.parse(resolveTemplates(node.config,scope));
        const ctx:BlockContext={pool,workspaceId:run.workspace_id,userId:run.created_by,signal:controller.signal,reportService:services.reportService,
          async credential(name,kind){
            const {rows}=await pool.query('SELECT ciphertext,kind FROM tectique_credentials WHERE workspace_id=$1 AND name=$2',[run.workspace_id,name]);
            if(!rows.length)throw new Error(`A credencial "${name}" não existe neste workspace.`);
            if(kind&&rows[0].kind!==kind)throw new Error('O tipo da credencial não corresponde ao bloco.');
            const value=decryptSecret(rows[0].ciphertext,run.workspace_id);known.add(value);
            if(kind==='http'||kind==='smtp'){try{const data=JSON.parse(value);for(const key of ['token','password'])if(typeof data[key]==='string')known.add(data[key]);}catch{}}
            return value;
          }};
        const ms=block.timeoutMs??30_000;
        const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error(`O bloco excedeu o tempo limite de ${Math.round(ms/1000)} segundos.`));},ms);});
        const result=await Promise.race([block.run(ctx,config,scope.trigger),timeout]);
        const json=JSON.stringify(redact(result.output??null,known));
        if(Buffer.byteLength(json)>MAX_OUTPUT_BYTES)throw new Error('A saída do bloco excede o limite de 256 KB.');
        // A saída do gatilho (valores padrão + dados enviados) é o que {{ trigger.* }} enxerga nos blocos seguintes.
        if(isTrigger)scope.trigger=result.output??{};
        scope.steps[id]={output:result.output};branch[id]=result.branch;status[id]='succeeded';
        await pool.query("UPDATE tectique_run_steps SET status='succeeded',input=$2,output=$3,branch=$4,finished_at=now() WHERE id=$1",
          [stepId,JSON.stringify(redact(config,known)),json,result.branch??null]);
      }catch(e){
        const message=String(redact(describe(e),known)).slice(0,500);
        status[id]='failed';failure=`Falha no bloco "${node.name||id}": ${message}`;
        await pool.query("UPDATE tectique_run_steps SET status='failed',error=$2,finished_at=now() WHERE id=$1",[stepId,message]);
        break;
      }finally{clearTimeout(timer);}
    }
    await pool.query("UPDATE tectique_runs SET status=$2,error=$3,finished_at=now(),lease_until=NULL WHERE id=$1",[run.id,failure?'failed':'succeeded',failure]);
  }catch(e){
    // Falha inesperada do próprio motor (ex.: banco indisponível): registra o que for possível.
    console.error('Motor de execução:',e instanceof Error?e.message:'falha inesperada');
    await pool.query("UPDATE tectique_runs SET status='failed',error=$2,finished_at=now(),lease_until=NULL WHERE id=$1",[run.id,'Falha interna do motor de execução.']).catch(()=>{});
  }
}

export async function runPending(pool:pg.Pool,services:Services,max=5){
  await recoverStale(pool);await enqueueDueFlows(pool);
  let done=0;
  while(done<max){const run=await claimRun(pool);if(!run)break;await processRun(pool,run,services);done++;}
  return done;
}

export function startEngine(pool:pg.Pool,services:Services,pollMs=2000){
  let closed=false,busy=false,again=false;
  async function tick(){
    if(closed)return;
    if(busy){again=true;return;}
    busy=true;
    try{do{again=false;await runPending(pool,services);}while(again&&!closed);}
    catch(e){if(!closed)console.error('Motor de execução:',e instanceof Error?e.message:'falha inesperada');}
    finally{busy=false;}
  }
  const timer=setInterval(()=>void tick(),pollMs);timer.unref();
  void tick();
  return {nudge:()=>{void tick();},tick,stop:async()=>{closed=true;clearInterval(timer);while(busy)await sleep(100);}};
}
