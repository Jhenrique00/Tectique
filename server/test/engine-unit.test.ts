import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
process.env.TECTIQUE_MASTER_KEY=randomBytes(32).toString('base64');
const {resolveTemplates,evaluate,TemplateError}=await import('../src/engine/blocks.js');
const {validateDefinition,templates}=await import('../src/engine/definition.js');
const {encryptSecret,decryptSecret,redact}=await import('../src/engine/secrets.js');
const {can}=await import('../src/workspaces.js');

test('variáveis: tipo preservado, interpolação e bloqueio de caminhos perigosos',()=>{
  const scope={trigger:{n:7,repo:'a/b'},steps:{x:{output:{list:[1,2],name:'Ana'}}}};
  assert.equal(resolveTemplates('{{ trigger.n }}',scope),7);
  assert.equal(resolveTemplates('Olá {{ steps.x.output.name }}!',scope),'Olá Ana!');
  assert.deepEqual(resolveTemplates({a:['{{trigger.repo}}']},scope),{a:['a/b']});
  assert.equal(resolveTemplates('{{ steps.x.output.list.1 }}',scope),2);
  for(const bad of ['{{ trigger.nao }}','{{ trigger.__proto__ }}','{{ constructor.name }}','{{ steps.x.output.name.length }}'])
    assert.throws(()=>resolveTemplates(bad,scope),TemplateError,bad);
});
test('condição: comparações numéricas, texto e erros claros',()=>{
  assert.equal(evaluate('gt','10',5),true);assert.equal(evaluate('eq','5',5),true);assert.equal(evaluate('ne','a','b'),true);
  assert.equal(evaluate('contains','abc','b'),true);assert.equal(evaluate('contains',['x','y'],'y'),true);
  assert.equal(evaluate('exists',null,undefined),false);assert.equal(evaluate('exists','x',undefined),true);
  assert.throws(()=>evaluate('gt','abc',1),/dois números/);
});
const ok={nodes:[{id:'t',type:'trigger.manual',config:{}},{id:'r',type:'github.report',config:{repository:'a/b',days:30}}],edges:[{from:'t',to:'r'}]};
test('definição válida e erros de estrutura',()=>{
  assert.equal(validateDefinition(ok).ok,true);
  const bad=(d:any,re:RegExp)=>{const v=validateDefinition(d);assert.equal(v.ok,false);assert.match(v.errors.join('|'),re);};
  bad({...ok,nodes:[ok.nodes[1]]},/precisa de um gatilho/);
  bad({...ok,nodes:[...ok.nodes,{id:'x',type:'nao.existe',config:{}}]},/tipo desconhecido/);
  bad({...ok,nodes:[...ok.nodes,{id:'t2',type:'trigger.schedule',config:{interval_hours:6}}]},/apenas um gatilho/);
  bad({nodes:[ok.nodes[0],ok.nodes[1],{id:'a',type:'logic.set',config:{values:{}}}],edges:[{from:'t',to:'r'},{from:'r',to:'a'},{from:'a',to:'r'}]},/ciclo/);
  bad({...ok,nodes:[...ok.nodes,{id:'solto',type:'logic.set',config:{values:{}}}]},/não é alcançado/);
  bad({...ok,edges:[{from:'t',to:'fantasma'}]},/Conexão inválida/);
  bad({...ok,edges:[{from:'t',to:'r',branch:'true'}]},/Só condições/);
  bad({nodes:[ok.nodes[0],{id:'c',type:'logic.condition',config:{left:1,operator:'eq',right:1}},{id:'s',type:'logic.set',config:{values:{}}}],edges:[{from:'t',to:'c'},{from:'c',to:'s'}]},/precisa indicar/);
  bad({...ok,nodes:[ok.nodes[0],{id:'r',type:'github.report',config:{repository:'a/b',days:15}}]},/Use 7, 30 ou 90/);
  bad({...ok,nodes:[ok.nodes[0],{id:'r',type:'github.report',config:{days:30}}]},/repository/);
  bad({...ok,nodes:[ok.nodes[0],{id:'r',type:'github.report',config:{repository:'{{ steps.r.output.x }}',days:30}}]},/não vem antes/);
  bad({...ok,nodes:[ok.nodes[0],{id:'r',type:'github.report',config:{repository:'{{ outra.coisa }}',days:30}}]},/inválida/);
});
test('valores com variáveis passam na validação (são checados na execução)',()=>{
  assert.equal(validateDefinition({...ok,nodes:[ok.nodes[0],{id:'r',type:'github.report',config:{repository:'{{ trigger.repo }}',days:'{{ trigger.days }}'}}]}).ok,true);
});
test('modelo GitHub Analytics gera fluxos válidos (manual e agendado)',()=>{
  const t=templates[0];
  const manual=validateDefinition(t.build({repository:'octocat/Hello-World',days:30}));
  assert.equal(manual.ok,true);assert.equal(manual.triggerType,'manual');
  const sched=validateDefinition(t.build({repository:'octocat/Hello-World',days:7,interval_hours:6}));
  assert.equal(sched.ok,true);assert.equal(sched.triggerType,'schedule');assert.equal(sched.scheduleHours,6);
});
test('credenciais: cifra autenticada presa ao workspace',()=>{
  const enc=encryptSecret('ghp_segredoSuperSecreto1234567890','ws-1');
  assert.ok(!enc.includes('segredo'));assert.equal(decryptSecret(enc,'ws-1'),'ghp_segredoSuperSecreto1234567890');
  assert.throws(()=>decryptSecret(enc,'ws-2'),/decifrar/);
  assert.throws(()=>decryptSecret(enc.slice(0,-4)+'AAAA','ws-1'),/decifrar/);
  assert.notEqual(encryptSecret('x','ws-1'),encryptSecret('x','ws-1'));
});
test('redação remove chaves sensíveis, tokens conhecidos e segredos informados',()=>{
  const out=redact({token:'abc',nested:{Authorization:'Bearer abcdefghijklmnop',ok:'visível'},msg:'usei ghp_abcdefghijklmnopqrstuvwxyz1234 e minha-senha-123'},['minha-senha-123']);
  assert.equal(out.token,'[oculto]');assert.equal(out.nested.Authorization,'[oculto]');assert.equal(out.nested.ok,'visível');
  assert.ok(!JSON.stringify(out).includes('ghp_abc'));assert.ok(!JSON.stringify(out).includes('minha-senha-123'));
});
test('permissões por papel',()=>{
  assert.equal(can('viewer','read'),true);assert.equal(can('viewer','write'),false);
  assert.equal(can('member','run'),true);assert.equal(can('member','credentials'),false);
  assert.equal(can('admin','credentials'),true);assert.equal(can('admin','members'),true);
});
