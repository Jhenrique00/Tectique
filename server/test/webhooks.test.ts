import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import request from 'supertest';
import {z} from 'zod';
import {createPool,migrate} from '../src/db.js';
import {createApp} from '../src/app.js';
import {runPending} from '../src/engine/executor.js';
import {registerBlock} from '../src/engine/blocks.js';
process.env.TECTIQUE_MASTER_KEY=randomBytes(32).toString('base64');
const pool=createPool(process.env.TEST_DATABASE_URL!),app=createApp(pool),owner=request.agent(app),viewer=request.agent(app),other=request.agent(app);
let wid='',flow='',token='';
const base=()=>`/api/workspaces/${wid}`;
const call=(id:string,t=token)=>request(app).post(`/api/hooks/${flow}`).set('Authorization','Bearer '+t).set('X-Tectique-Event-Id',id).send({name:'Ana',password:'never-persist'});
before(async()=>{
  await migrate(pool);
  for(const [agent,email] of [[owner,'owner'],[viewer,'viewer'],[other,'other']] as const)await agent.post('/api/auth/register').send({name:email,email:email+'@hooks.test',password:'StrongPassword123'}).expect(201);
  wid=(await owner.get('/api/workspaces')).body.items[0].id;
  await owner.post(base()+'/members').send({email:'viewer@hooks.test',role:'viewer'}).expect(201);
  flow=(await owner.post(base()+'/flows').send({name:'Entrada',definition:{nodes:[{id:'t',type:'trigger.webhook',config:{}},{id:'out',type:'logic.set',config:{values:{name:'{{ trigger.name }}'}}}],edges:[{from:'t',to:'out'}]}}).expect(201)).body.flow.id;
});
after(async()=>pool.end());
test('migração v4 é idempotente e conserva fluxo existente',async()=>{await migrate(pool);await migrate(pool);assert.equal((await pool.query('SELECT name FROM tectique_flows WHERE id=$1',[flow])).rows[0].name,'Entrada');});
test('somente administradores gerenciam webhook; token aparece uma vez e fica em hash',async()=>{
  await viewer.post(base()+`/flows/${flow}/webhook`).expect(403);await other.post(base()+`/flows/${flow}/webhook`).expect(404);
  const r=await owner.post(base()+`/flows/${flow}/webhook`).expect(200);token=r.body.token;assert.equal(token.length,64);
  const info=(await owner.get(base()+`/flows/${flow}/webhook`)).body;assert.equal(info.token,undefined);assert.equal(info.enabled,true);
  assert.notEqual((await pool.query('SELECT webhook_hash FROM tectique_flows WHERE id=$1',[flow])).rows[0].webhook_hash,token);
});
test('webhook rejeita token ausente/incorreto, evento sem id e JSON grande',async()=>{
  await request(app).post(`/api/hooks/${flow}`).send({}).expect(401);await call('invalid','0'.repeat(64)).expect(401);
  await request(app).post(`/api/hooks/${flow}`).set('Authorization','Bearer '+token).send({}).expect(422);
  await request(app).post(`/api/hooks/${flow}`).set('Authorization','Bearer '+token).set('X-Tectique-Event-Id','huge').send({v:'x'.repeat(33000)}).expect(413);
});
test('eventos concorrentes iguais enfileiram uma vez; execução usa dados reais e mascara segredo',async()=>{
  const [a,b]=await Promise.all([call('same-event'),call('same-event')]);assert.deepEqual([a.status,b.status].sort(),[200,202]);assert.equal(a.body.run.id,b.body.run.id);
  await runPending(pool,{reportService:async()=>{throw new Error('não usado');}},10);
  const detail=(await owner.get(base()+`/runs/${a.body.run.id}`).expect(200)).body;
  assert.equal(detail.run.status,'succeeded');assert.equal(detail.steps.find((s:any)=>s.node_id==='out').output.name,'Ana');assert.ok(!JSON.stringify(detail).includes('never-persist'));
});
test('rotacionar revoga token anterior, pausar recusa eventos, revogar remove acesso',async()=>{
  const old=token;token=(await owner.post(base()+`/flows/${flow}/webhook`)).body.token;await call('old',old).expect(401);
  await owner.patch(base()+`/flows/${flow}`).send({enabled:false}).expect(200);await call('paused').expect(401);
  await owner.patch(base()+`/flows/${flow}`).send({enabled:true}).expect(200);await call('new').expect(202);
  await owner.delete(base()+`/flows/${flow}/webhook`).expect(204);await call('revoked').expect(401);
  await owner.patch(base()+`/flows/${flow}`).send({enabled:true}).expect(409);
  token=(await owner.post(base()+`/flows/${flow}/webhook`)).body.token;
  await owner.put(base()+`/flows/${flow}`).send({definition:{nodes:[{id:'t',type:'trigger.manual',config:{}}],edges:[]}}).expect(200);
  await owner.put(base()+`/flows/${flow}`).send({definition:{nodes:[{id:'t',type:'trigger.webhook',config:{}}],edges:[]}}).expect(200);
  await call('old-after-conversion').expect(401);
});
test('conexões são validadas, criptografadas e isoladas por workspace',async()=>{
  await viewer.post(base()+'/credentials').send({name:'no',kind:'http',secret:'{}'}).expect(403);
  await owner.post(base()+'/credentials').send({name:'bad',kind:'smtp',secret:'{}'}).expect(422);
  const secret=JSON.stringify({host:'example.com',token:'secret-value-123'});
  await owner.post(base()+'/credentials').send({name:'public-api',kind:'http',secret}).expect(201);
  const listed=await owner.get(base()+'/credentials');assert.ok(!JSON.stringify(listed.body).includes('secret-value-123'));
  const row=(await pool.query('SELECT ciphertext FROM tectique_credentials WHERE workspace_id=$1',[wid])).rows[0];assert.ok(!row.ciphertext.includes('secret-value-123'));
  await other.get(base()+'/credentials').expect(404);
});
test('motor oculta token extraído do JSON da conexão, inclusive quando refletido em resposta',async()=>{
  registerBlock({type:'test.connection',label:'test',description:'',category:'action',schema:z.object({}),async run(ctx){const c=JSON.parse(await ctx.credential('public-api','http'));return {output:{echo:c.token}};}});
  const f=(await owner.post(base()+'/flows').send({name:'Redação',definition:{nodes:[{id:'t',type:'trigger.manual',config:{}},{id:'a',type:'test.connection',config:{}}],edges:[{from:'t',to:'a'}]}})).body.flow;
  const run=(await owner.post(base()+`/flows/${f.id}/run`).send({})).body.run;await runPending(pool,{reportService:async()=>{throw new Error('não usado');}},10);
  const detail=(await owner.get(base()+`/runs/${run.id}`)).body;assert.equal(detail.run.status,'succeeded');assert.equal(detail.steps.find((s:any)=>s.node_id==='a').output.echo,'[oculto]');
});
