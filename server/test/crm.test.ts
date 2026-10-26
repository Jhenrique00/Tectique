import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {createPool,migrate} from '../src/db.js';
import {createApp} from '../src/app.js';
import {captureContact} from '../src/crm.js';
import {runPending} from '../src/engine/executor.js';
const pool=createPool(process.env.TEST_DATABASE_URL!),app=createApp(pool),owner=request.agent(app),member=request.agent(app),viewer=request.agent(app),other=request.agent(app);
let wid='',otherWid='',ownerId='',contact:any,task:any;
const base=()=>`/api/workspaces/${wid}/crm`;
before(async()=>{
  await migrate(pool);
  for(const [agent,name] of [[owner,'Owner'],[member,'Member'],[viewer,'Viewer'],[other,'Other']] as const){const r=await agent.post('/api/auth/register').send({name,email:name.toLowerCase()+'@crm.test',password:'PasswordForTests123'}).expect(201);if(name==='Owner')ownerId=r.body.user.id;}
  wid=(await owner.get('/api/workspaces')).body.items[0].id;otherWid=(await other.get('/api/workspaces')).body.items[0].id;
  for(const role of ['member','viewer'])await owner.post(`/api/workspaces/${wid}/members`).send({email:role+'@crm.test',role}).expect(201);
});
after(async()=>pool.end());
test('cadastro, busca literal, e-mail normalizado e dados persistidos após migração',async()=>{
  contact=(await owner.post(base()+'/contacts').send({name:'Ana % Souza',email:'ANA@EXAMPLE.COM',phone:'+55 71 99999-0000',company:'Oficina',source:'Indicação'}).expect(201)).body.contact;
  assert.equal(contact.email,'ana@example.com');await migrate(pool);await migrate(pool);
  const r=await member.get(base()+'/contacts?q=%25').expect(200);assert.equal(r.body.total,1);assert.equal(r.body.items[0].id,contact.id);
  assert.equal((await owner.get(base()+'/contacts?q=naoexiste')).body.total,0);
  await owner.post(base()+'/contacts').send({name:'Duplicado',email:'ana@example.com'}).expect(409);
  await other.post(`/api/workspaces/${otherWid}/crm/contacts`).send({name:'Ana outro workspace',email:'ana@example.com'}).expect(201);
});
test('edição parcial conserva dados; alteração concorrente recebe conflito',async()=>{
  const first=await member.patch(base()+'/contacts/'+contact.id).send({version:contact.version,stage:'proposal'}).expect(200);
  assert.equal(first.body.contact.email,contact.email);assert.equal(first.body.contact.phone,contact.phone);assert.equal(first.body.contact.source,'Indicação');
  await owner.patch(base()+'/contacts/'+contact.id).send({version:contact.version,name:'Não sobrescrever'}).expect(409);contact=first.body.contact;
  assert.equal((await owner.get(base()+'/contacts?stage=proposal')).body.total,1);
  const history=(await owner.get(base()+`/contacts/${contact.id}/activity`)).body;assert.ok(history.items.some((i:any)=>i.body.includes('Proposta enviada')));
});
test('validação rejeita campos desconhecidos, e-mail inválido e etapa inválida',async()=>{
  for(const input of [{name:'A'},{name:'Nome',email:'invalid'},{name:'Nome',stage:'inventado'},{name:'Nome',workspace_id:otherWid}])await owner.post(base()+'/contacts').send(input).expect(422);
  await owner.patch(base()+'/contacts/'+contact.id).send({name:'Sem versão'}).expect(422);
});
test('leitor consulta mas não escreve; outro workspace não acessa contato ou atividades',async()=>{
  await viewer.get(base()+'/contacts').expect(200);await viewer.get(base()+`/contacts/${contact.id}`).expect(200);
  await viewer.post(base()+'/contacts').send({name:'Proibido'}).expect(403);
  await viewer.patch(base()+`/contacts/${contact.id}`).send({version:contact.version,stage:'won'}).expect(403);
  await viewer.post(base()+`/contacts/${contact.id}/notes`).send({body:'não'}).expect(403);
  await other.get(base()+'/contacts').expect(404);
  for(const suffix of ['', '/activity'])await other.get(`/api/workspaces/${otherWid}/crm/contacts/${contact.id}${suffix}`).expect(404);
});
test('anotações e tarefas ficam no histórico e prazos aparecem nos totais',async()=>{
  await member.post(base()+`/contacts/${contact.id}/notes`).send({body:'Cliente pediu proposta para sexta.'}).expect(201);
  task=(await member.post(base()+`/contacts/${contact.id}/tasks`).send({title:'Retornar para Ana',due_at:'2020-01-01T10:00:00-03:00'}).expect(201)).body.task;
  const summary=(await owner.get(base()+'/summary')).body;assert.equal(summary.pending,1);assert.equal(summary.overdue,1);
  assert.equal((await viewer.get(base()+'/tasks')).body.items[0].contact_name,contact.name);
  await viewer.patch(base()+'/tasks/'+task.id).send({version:task.version,completed:true}).expect(403);
  await other.patch(`/api/workspaces/${otherWid}/crm/tasks/${task.id}`).send({version:task.version,completed:true}).expect(404);
  const activity=(await owner.get(base()+`/contacts/${contact.id}/activity`)).body;assert.ok(activity.items.some((x:any)=>x.body==='Cliente pediu proposta para sexta.'));
});
test('tarefas podem ser concluídas e reabertas; versão impede sobrescrita',async()=>{
  const r=await owner.patch(base()+'/tasks/'+task.id).send({version:task.version,completed:true}).expect(200);
  await owner.patch(base()+'/tasks/'+task.id).send({version:task.version,completed:false}).expect(409);task=r.body.task;
  assert.equal((await owner.get(base()+'/summary')).body.pending,0);
  task=(await member.patch(base()+'/tasks/'+task.id).send({version:task.version,completed:false}).expect(200)).body.task;
  assert.equal((await owner.get(base()+'/tasks?completed=false')).body.total,1);
});
test('arquivar e restaurar preserva histórico e tarefas, bloqueando novas alterações operacionais',async()=>{
  contact=(await owner.patch(base()+'/contacts/'+contact.id).send({version:contact.version,archived:true}).expect(200)).body.contact;
  assert.equal((await owner.get(base()+'/contacts')).body.total,0);assert.equal((await owner.get(base()+'/contacts?archived=true')).body.total,1);assert.equal((await owner.get(base()+'/tasks')).body.total,0);
  await owner.post(base()+`/contacts/${contact.id}/notes`).send({body:'Bloqueado'}).expect(409);
  await owner.patch(base()+`/contacts/${contact.id}`).send({version:contact.version,name:'Bloqueado'}).expect(409);
  await owner.post(base()+`/contacts/${contact.id}/tasks`).send({title:'Bloqueado'}).expect(409);
  await assert.rejects(captureContact(pool,wid,ownerId,{name:'Ana',email:'ana@example.com'}),/arquivado/);
  contact=(await owner.patch(base()+'/contacts/'+contact.id).send({version:contact.version,archived:false}).expect(200)).body.contact;
  assert.equal((await owner.get(base()+'/tasks')).body.total,1);assert.ok((await owner.get(base()+`/contacts/${contact.id}/activity`)).body.total>=7);
});
test('captura concorrente por e-mail cria só um contato; preserva etapa e campos omitidos',async()=>{
  const results=await Promise.all(Array.from({length:4},()=>captureContact(pool,wid,ownerId,{name:'Lead',email:'lead@example.com',phone:'123',source:'Formulário'})));
  assert.equal(new Set(results.map(r=>r.contact_id)).size,1);assert.equal(results.filter(r=>r.created).length,1);
  let lead=(await owner.get(base()+'/contacts/'+results[0].contact_id)).body.contact;
  lead=(await owner.patch(base()+'/contacts/'+lead.id).send({version:lead.version,stage:'won'})).body.contact;
  await captureContact(pool,wid,ownerId,{name:'Lead atualizado',email:'LEAD@example.com'});
  const updated=(await owner.get(base()+'/contacts/'+lead.id)).body.contact;assert.equal(updated.phone,'123');assert.equal(updated.stage,'won');assert.equal(updated.source,'Formulário');
});
test('webhook → bloco CRM → cliente real, com saída no histórico do motor',async()=>{
  const definition={nodes:[{id:'t',type:'trigger.webhook',config:{}},{id:'cliente',type:'crm.contact',config:{name:'{{ trigger.name }}',email:'{{ trigger.email }}',source:'Webhook'}}],edges:[{from:'t',to:'cliente'}]};
  const f=(await owner.post(`/api/workspaces/${wid}/flows`).send({name:'Captura',definition}).expect(201)).body.flow;
  const token=(await owner.post(`/api/workspaces/${wid}/flows/${f.id}/webhook`).expect(200)).body.token;
  const result=await request(app).post('/api/hooks/'+f.id).set('Authorization','Bearer '+token).set('X-Tectique-Event-Id','crm-1').send({name:'Bruno do formulário',email:'bruno@example.com'}).expect(202);
  await runPending(pool,{reportService:async()=>{throw new Error('não usado');}},10);
  const run=(await owner.get(`/api/workspaces/${wid}/runs/${result.body.run.id}`)).body;assert.equal(run.run.status,'succeeded');
  const output=run.steps.find((s:any)=>s.node_id==='cliente').output;assert.equal(output.created,true);
  const saved=(await owner.get(base()+'/contacts/'+output.contact_id)).body.contact;assert.equal(saved.name,'Bruno do formulário');assert.equal(saved.source,'Webhook');
});
