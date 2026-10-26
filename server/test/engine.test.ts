import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import request from 'supertest';
import {z} from 'zod';
process.env.TECTIQUE_MASTER_KEY=randomBytes(32).toString('base64');
const {createPool,migrate}=await import('../src/db.js');
const {createApp}=await import('../src/app.js');
const {runPending}=await import('../src/engine/executor.js');
const {registerBlock}=await import('../src/engine/blocks.js');

const pool=createPool(process.env.TEST_DATABASE_URL!);
let calls=0,failNext=0;
const fakeReport:any=async(repository:string,days:number)=>{
  calls++;if(failNext>0){failNext--;throw new Error('GitHub indisponível (teste).');}
  return {repository,repository_url:'https://github.com/'+repository,description:null,default_branch:'main',days,since:'2026-09-24T00:00:00Z',
    generated_at:new Date().toISOString(),commits:[{id:'1'}],issues:[],pull_requests:[],partial:false,notes:[],summary:`Resumo de ${repository}.`};
};
const services={reportService:fakeReport};
registerBlock({type:'test.leak',label:'teste',description:'',category:'action',schema:z.object({name:z.string()}),
  async run(ctx,config){const secret=await ctx.credential(config.name);return {output:{echoed:secret,note:`o valor é ${secret}`}};}});
registerBlock({type:'test.slow',label:'teste',description:'',category:'action',timeoutMs:50,schema:z.object({}),
  async run(){await new Promise(r=>setTimeout(r,500));return {output:{}};}});

const app=createApp(pool,fakeReport);
const alice=request.agent(app),bob=request.agent(app),carol=request.agent(app);
let wsA='',wsB='',aliceId='',bobId='';
const drain=()=>runPending(pool,services,50);
const mk=async(agent:any,wid:string,def:any,name='Fluxo')=>(await agent.post(`/api/workspaces/${wid}/flows`).send({name,definition:def}).expect(201)).body.flow;
const run=async(agent:any,wid:string,id:string,payload:any={})=>{
  const queued=await agent.post(`/api/workspaces/${wid}/flows/${id}/run`).send({payload}).expect(202);await drain();
  return (await agent.get(`/api/workspaces/${wid}/runs/${queued.body.run.id}`).expect(200)).body;
};
const trig={id:'gatilho',type:'trigger.manual',config:{}};
const report=(extra:any={})=>({id:'relatorio',type:'github.report',config:{repository:'{{ trigger.repository }}',days:30,...extra}});

before(async()=>{
  await migrate(pool);
  const a=await alice.post('/api/auth/register').send({name:'Alice',email:'alice@motor.test',password:'SenhaForte@123'}).expect(201);aliceId=a.body.user.id;
  const b=await bob.post('/api/auth/register').send({name:'Bob',email:'bob@motor.test',password:'SenhaBob@1234'}).expect(201);bobId=b.body.user.id;
  await carol.post('/api/auth/register').send({name:'Carol',email:'carol@motor.test',password:'SenhaCarol@123'}).expect(201);
  wsA=(await alice.get('/api/workspaces').expect(200)).body.items[0].id;wsB=(await bob.get('/api/workspaces').expect(200)).body.items[0].id;
});
after(async()=>pool.end());

test('cada conta nasce com um workspace próprio; contas antigas ganham um na migração (idempotente)',async()=>{
  assert.notEqual(wsA,wsB);
  const list=(await alice.get('/api/workspaces').expect(200)).body.items;assert.equal(list.length,1);assert.equal(list[0].role,'owner');
  await pool.query("INSERT INTO tectique_users(name,email,password_hash) VALUES('Antigo','antigo@motor.test','x')");
  await migrate(pool);await migrate(pool);
  const {rows}=await pool.query("SELECT count(*)::integer AS n FROM tectique_workspace_members m JOIN tectique_users u ON u.id=m.user_id WHERE u.email='antigo@motor.test'");
  assert.equal(rows[0].n,1);
});
test('catálogo de blocos e modelos disponível apenas com login',async()=>{
  await request(app).get('/api/blocks').expect(401);
  const blocks=(await alice.get('/api/blocks').expect(200)).body.items.map((b:any)=>b.type);
  for(const t of ['trigger.manual','trigger.schedule','github.report','logic.condition','logic.set'])assert.ok(blocks.includes(t),t);
  assert.equal((await alice.get('/api/templates').expect(200)).body.items[0].id,'github-analytics');
});
test('modelo pronto → fluxo → execução real no motor, com etapas e relatório no histórico',async()=>{
  const created=await alice.post(`/api/workspaces/${wsA}/flows/from-template`).send({template:'github-analytics',params:{repository:'https://github.com/octocat/Hello-World',days:30}}).expect(201);
  const body=await run(alice,wsA,created.body.flow.id);
  assert.equal(body.run.status,'succeeded');
  assert.deepEqual(body.steps.map((s:any)=>[s.node_id,s.status]),[['gatilho','succeeded'],['relatorio','succeeded']]);
  assert.equal(body.steps[1].output.summary,'Resumo de octocat/Hello-World.');assert.equal(body.steps[1].output.commits,1);
  assert.equal((await alice.get('/api/reports').expect(200)).body.total,1);
  assert.equal((await bob.get('/api/reports').expect(200)).body.total,0);
});
test('validação rejeita fluxos quebrados com a lista de erros',async()=>{
  const bad={nodes:[trig,report()],edges:[{from:'gatilho',to:'relatorio'},{from:'relatorio',to:'gatilho'}]};
  const r=await alice.post(`/api/workspaces/${wsA}/flows`).send({name:'x',definition:bad}).expect(422);
  assert.ok(r.body.errors.length>0);
  assert.equal((await alice.post(`/api/workspaces/${wsA}/flows/validate`).send({definition:bad}).expect(200)).body.ok,false);
  await alice.post(`/api/workspaces/${wsA}/flows/from-template`).send({template:'github-analytics',params:{repository:'../etc/passwd',days:30}}).expect(422);
});
test('condição SE/SENÃO executa um caminho e pula o outro',async()=>{
  const def={nodes:[trig,{id:'c',type:'logic.condition',config:{left:'{{ trigger.n }}',operator:'gt',right:5}},
    {id:'sim',type:'logic.set',config:{values:{r:'maior'}}},{id:'nao',type:'logic.set',config:{values:{r:'menor'}}}],
    edges:[{from:'gatilho',to:'c'},{from:'c',to:'sim',branch:'true'},{from:'c',to:'nao',branch:'false'}]};
  const flow=await mk(alice,wsA,def);
  const hi=(await run(alice,wsA,flow.id,{n:10})).steps,lo=(await run(alice,wsA,flow.id,{n:2})).steps;
  const st=(steps:any[])=>Object.fromEntries(steps.map(s=>[s.node_id,s.status]));
  assert.deepEqual(st(hi),{gatilho:'succeeded',c:'succeeded',sim:'succeeded',nao:'skipped'});
  assert.deepEqual(st(lo),{gatilho:'succeeded',c:'succeeded',sim:'skipped',nao:'succeeded'});
});
test('falha registra o erro e "tentar novamente" reaproveita as etapas que já deram certo',async()=>{
  const def={nodes:[trig,{id:'dados',type:'logic.set',config:{values:{repo:'{{ trigger.repository }}'}}},
    {id:'relatorio',type:'github.report',config:{repository:'{{ steps.dados.output.repo }}',days:7}}],
    edges:[{from:'gatilho',to:'dados'},{from:'dados',to:'relatorio'}]};
  const flow=await mk(alice,wsA,def);
  failNext=1;
  const first=await run(alice,wsA,flow.id,{repository:'octocat/Hello-World'});
  assert.equal(first.run.status,'failed');assert.match(first.run.error,/indisponível/);
  assert.deepEqual(first.steps.map((s:any)=>s.status),['succeeded','succeeded','failed']);
  await bob.post(`/api/workspaces/${wsA}/runs/${first.run.id}/retry`).expect(404);
  const retry=await alice.post(`/api/workspaces/${wsA}/runs/${first.run.id}/retry`).expect(202);await drain();
  const second=(await alice.get(`/api/workspaces/${wsA}/runs/${retry.body.run.id}`).expect(200)).body;
  assert.equal(second.run.status,'succeeded');assert.equal(second.run.trigger_type,'retry');assert.equal(second.run.retry_of,first.run.id);
  assert.deepEqual(second.steps.map((s:any)=>[s.node_id,s.status]),[['gatilho','succeeded'],['dados','reused'],['relatorio','succeeded']]);
  await alice.post(`/api/workspaces/${wsA}/runs/${retry.body.run.id}/retry`).expect(409);
});
test('tempo limite por bloco e erro de variável inexistente viram falhas claras',async()=>{
  const slow=await run(alice,wsA,(await mk(alice,wsA,{nodes:[trig,{id:'lento',type:'test.slow',config:{}}],edges:[{from:'gatilho',to:'lento'}]})).id);
  assert.equal(slow.run.status,'failed');assert.match(slow.run.error,/tempo limite/);
  const missing=await run(alice,wsA,(await mk(alice,wsA,{nodes:[trig,report()],edges:[{from:'gatilho',to:'relatorio'}]})).id,{});
  assert.equal(missing.run.status,'failed');assert.match(missing.run.error,/trigger\.repository/);
});
test('credenciais: nunca voltam pela API nem aparecem no histórico; só administradores gerenciam',async()=>{
  const secret='ghp_SegredoMuitoSecreto1234567890abc';
  const made=await alice.post(`/api/workspaces/${wsA}/credentials`).send({name:'github-pessoal',kind:'token',secret}).expect(201);
  assert.ok(!JSON.stringify(made.body).includes('Segredo'));
  await alice.post(`/api/workspaces/${wsA}/credentials`).send({name:'github-pessoal',kind:'token',secret}).expect(409);
  const listed=await alice.get(`/api/workspaces/${wsA}/credentials`).expect(200);assert.ok(!JSON.stringify(listed.body).includes('Segredo'));
  const stored=await pool.query('SELECT ciphertext FROM tectique_credentials WHERE workspace_id=$1',[wsA]);
  assert.ok(!stored.rows[0].ciphertext.includes('Segredo'));
  const flow=await mk(alice,wsA,{nodes:[trig,{id:'vaza',type:'test.leak',config:{name:'github-pessoal'}}],edges:[{from:'gatilho',to:'vaza'}]});
  const result=await run(alice,wsA,flow.id);
  assert.equal(result.run.status,'succeeded');
  const everything=JSON.stringify(result)+JSON.stringify((await pool.query('SELECT * FROM tectique_run_steps')).rows);
  assert.ok(!everything.includes('SegredoMuitoSecreto'));assert.match(everything,/\[oculto\]/);
  const missing=await run(alice,wsA,(await mk(alice,wsA,{nodes:[trig,{id:'vaza',type:'test.leak',config:{name:'nao-existe'}}],edges:[{from:'gatilho',to:'vaza'}]})).id);
  assert.match(missing.run.error,/não existe neste workspace/);
  await bob.get(`/api/workspaces/${wsA}/credentials`).expect(404);
  const audit=(await alice.get(`/api/workspaces/${wsA}/audit`).expect(200)).body.items.map((a:any)=>a.action);assert.ok(audit.includes('credential.create'));
  assert.ok(!JSON.stringify((await pool.query('SELECT detail FROM tectique_audit')).rows).includes('Segredo'));
  const id=made.body.credential.id;await alice.delete(`/api/workspaces/${wsA}/credentials/${id}`).expect(204);
});
test('isolamento entre workspaces: fluxos, execuções e credenciais de outra conta são invisíveis',async()=>{
  const flow=await mk(alice,wsA,{nodes:[trig],edges:[]},'Privado');
  await bob.get(`/api/workspaces/${wsA}/flows`).expect(404);
  await bob.get(`/api/workspaces/${wsA}/flows/${flow.id}`).expect(404);
  await bob.post(`/api/workspaces/${wsA}/flows/${flow.id}/run`).expect(404);
  await bob.get(`/api/workspaces/${wsB}/flows/${flow.id}`).expect(404);
  await bob.delete(`/api/workspaces/${wsB}/flows/${flow.id}`).expect(404);
  assert.equal((await bob.get(`/api/workspaces/${wsB}/flows`).expect(200)).body.items.length,0);
  await request(app).get(`/api/workspaces/${wsA}/flows`).expect(401);
});
test('papéis: leitor só lê, membro opera, administrador não promove a dono, último dono não sai',async()=>{
  await alice.post(`/api/workspaces/${wsA}/members`).send({email:'bob@motor.test',role:'viewer'}).expect(201);
  await alice.post(`/api/workspaces/${wsA}/members`).send({email:'bob@motor.test',role:'viewer'}).expect(409);
  await alice.post(`/api/workspaces/${wsA}/members`).send({email:'ninguem@motor.test',role:'viewer'}).expect(404);
  await bob.get(`/api/workspaces/${wsA}/flows`).expect(200);
  await bob.post(`/api/workspaces/${wsA}/flows`).send({name:'x',definition:{nodes:[trig],edges:[]}}).expect(403);
  await bob.post(`/api/workspaces/${wsA}/members`).send({email:'carol@motor.test',role:'viewer'}).expect(403);
  await alice.patch(`/api/workspaces/${wsA}/members/${bobId}`).send({role:'member'}).expect(200);
  const flow=await mk(bob,wsA,{nodes:[trig],edges:[]},'Do Bob');
  assert.equal((await run(bob,wsA,flow.id)).run.status,'succeeded');
  await bob.get(`/api/workspaces/${wsA}/credentials`).expect(403);
  await alice.patch(`/api/workspaces/${wsA}/members/${bobId}`).send({role:'admin'}).expect(200);
  await bob.post(`/api/workspaces/${wsA}/members`).send({email:'carol@motor.test',role:'owner'}).expect(403);
  await bob.post(`/api/workspaces/${wsA}/members`).send({email:'carol@motor.test',role:'member'}).expect(201);
  await bob.patch(`/api/workspaces/${wsA}/members/${aliceId}`).send({role:'viewer'}).expect(403);
  await alice.patch(`/api/workspaces/${wsA}/members/${aliceId}`).send({role:'admin'}).expect(409);
  await alice.delete(`/api/workspaces/${wsA}/members/${aliceId}`).expect(409);
  await bob.delete(`/api/workspaces/${wsA}/members/${bobId}`).expect(204);
  await bob.get(`/api/workspaces/${wsA}/flows`).expect(404);
});
test('agendamento: dispara quando vence, avança a próxima execução e não duplica',async()=>{
  const flow=(await alice.post(`/api/workspaces/${wsA}/flows/from-template`).send({template:'github-analytics',params:{repository:'octocat/Hello-World',days:7,interval_hours:6}}).expect(201)).body.flow;
  assert.equal(flow.enabled,false);assert.equal(flow.next_run_at,null);
  await drain();assert.equal((await pool.query("SELECT count(*)::integer n FROM tectique_runs WHERE flow_id=$1",[flow.id])).rows[0].n,0);
  const on=(await alice.patch(`/api/workspaces/${wsA}/flows/${flow.id}`).send({enabled:true}).expect(200)).body.flow;assert.ok(on.next_run_at);
  await drain();assert.equal((await pool.query("SELECT count(*)::integer n FROM tectique_runs WHERE flow_id=$1",[flow.id])).rows[0].n,0);
  await pool.query("UPDATE tectique_flows SET next_run_at=now()-interval '1 minute' WHERE id=$1",[flow.id]);
  await Promise.all([drain(),drain()]);
  const runs=(await alice.get(`/api/workspaces/${wsA}/runs?flow_id=${flow.id}`).expect(200)).body.items;
  assert.equal(runs.length,1);assert.equal(runs[0].trigger_type,'schedule');assert.equal(runs[0].status,'succeeded');
  const after=(await alice.get(`/api/workspaces/${wsA}/flows/${flow.id}`).expect(200)).body.flow;assert.ok(new Date(after.next_run_at)>new Date(Date.now()+5*3600e3));
  await alice.patch(`/api/workspaces/${wsA}/flows/${flow.id}`).send({enabled:false}).expect(200);
  await pool.query("UPDATE tectique_flows SET next_run_at=now()-interval '1 minute' WHERE id=$1",[flow.id]);await drain();
  assert.equal((await alice.get(`/api/workspaces/${wsA}/runs?flow_id=${flow.id}`).expect(200)).body.total,1);
});
test('fila: execuções concorrentes processam cada item exatamente uma vez; cancelar só na fila',async()=>{
  const flow=await mk(alice,wsA,{nodes:[trig,report()],edges:[{from:'gatilho',to:'relatorio'}]},'Fila');
  const ids:string[]=[];
  for(let i=0;i<6;i++)ids.push((await alice.post(`/api/workspaces/${wsA}/flows/${flow.id}/run`).send({payload:{repository:'a/b'+i}}).expect(202)).body.run.id);
  await alice.post(`/api/workspaces/${wsA}/runs/${ids[5]}/cancel`).expect(200);
  const before=calls;await Promise.all([drain(),drain(),drain()]);
  assert.equal(calls-before,5);
  const {rows}=await pool.query('SELECT status,count(*)::integer n FROM tectique_runs WHERE id=ANY($1) GROUP BY status ORDER BY status',[ids]);
  assert.deepEqual(rows,[{status:'cancelled',n:1},{status:'succeeded',n:5}]);
  await alice.post(`/api/workspaces/${wsA}/runs/${ids[0]}/cancel`).expect(409);
});
test('recuperação: execução presa vira falha (sem repetir efeitos) e pode ser retomada manualmente',async()=>{
  const flow=await mk(alice,wsA,{nodes:[trig,report()],edges:[{from:'gatilho',to:'relatorio'}]},'Presa');
  const {rows}=await pool.query(`INSERT INTO tectique_runs(workspace_id,flow_id,flow_name,flow_version,definition,trigger_type,trigger_payload,status,started_at,lease_until,created_by)
    VALUES($1,$2,'Presa',1,$3,'manual',$4,'running',now()-interval '1 hour',now()-interval '50 minutes',$5) RETURNING id`,
    [wsA,flow.id,JSON.stringify({nodes:[trig,report()],edges:[{from:'gatilho',to:'relatorio'}]}),JSON.stringify({repository:'a/b'}),aliceId]);
  const before=calls;await drain();assert.equal(calls,before);
  const got=(await alice.get(`/api/workspaces/${wsA}/runs/${rows[0].id}`).expect(200)).body.run;
  assert.equal(got.status,'failed');assert.match(got.error,/interrompida/i);
  await alice.post(`/api/workspaces/${wsA}/runs/${rows[0].id}/retry`).expect(202);await drain();assert.equal(calls,before+1);
});
test('editar, pausar e excluir fluxos; histórico das execuções é preservado',async()=>{
  const flow=await mk(alice,wsA,{nodes:[trig],edges:[]},'Editável');
  const upd=(await alice.put(`/api/workspaces/${wsA}/flows/${flow.id}`).send({name:'Renomeado',definition:{nodes:[trig,{id:'v',type:'logic.set',config:{values:{a:1}}}],edges:[{from:'gatilho',to:'v'}]}}).expect(200)).body.flow;
  assert.equal(upd.name,'Renomeado');assert.equal(upd.version,2);
  await alice.put(`/api/workspaces/${wsA}/flows/${flow.id}`).send({definition:{nodes:[],edges:[]}}).expect(422);
  const done=await run(alice,wsA,flow.id);assert.equal(done.run.flow_version,2);
  await alice.delete(`/api/workspaces/${wsA}/flows/${flow.id}`).expect(204);
  const kept=(await alice.get(`/api/workspaces/${wsA}/runs/${done.run.id}`).expect(200)).body;assert.equal(kept.run.flow_name,'Renomeado');assert.equal(kept.run.flow_id,null);
});
