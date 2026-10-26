import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
process.env.TECTIQUE_MASTER_KEY=randomBytes(32).toString('base64');
const M=await import('../src/editor/model.js');
const {validateDefinition}=await import('../../server/src/engine/definition.js');

const flow=()=>{let d=M.newFlow();let r=M.addNode(d,'github.report');d=r.def;const gh=r.id;
  d=M.updateNode(d,gh,{config:{repository:'{{ trigger.repository }}',days:30}});
  d=M.updateNode(d,'gatilho',{config:{defaults:{repository:'octocat/Hello-World'}}});
  d=M.connect(d,'gatilho',gh);return {d,gh};};

test('novo fluxo e fluxo montado pelo editor são aceitos pelo validador do servidor',()=>{
  assert.equal(validateDefinition(M.newFlow()).ok,true);
  const {d}=flow();const v=validateDefinition(d);assert.equal(v.ok,true,v.errors.join('|'));assert.equal(v.triggerType,'manual');
});
test('condição com dois caminhos montada pelo editor é válida e executável',()=>{
  let {d,gh}=flow();
  let r=M.addNode(d,'logic.condition');d=r.def;const cond=r.id;
  d=M.updateNode(d,cond,{config:{left:`{{ steps.${gh}.output.commits }}`,operator:'gt',right:0}});d=M.connect(d,gh,cond);
  const a=M.addNode(d,'logic.set');d=a.def;const b=M.addNode(d,'logic.set');d=b.def;
  d=M.connect(d,cond,a.id,'true');d=M.connect(d,cond,b.id,'false');
  const v=validateDefinition(d);assert.equal(v.ok,true,v.errors.join('|'));
  assert.deepEqual(d.edges.filter(e=>e.from===cond).map(e=>e.branch).sort(),['false','true']);
});
test('regras de conexão: ciclo, duplicada, gatilho como destino, condição sem caminho',()=>{
  let {d,gh}=flow();const c=M.addNode(d,'logic.set');d=M.connect(c.def,gh,c.id);
  assert.throws(()=>M.connect(d,c.id,gh),/ciclo/);
  assert.throws(()=>M.connect(d,gh,c.id),/já existe/);
  assert.throws(()=>M.connect(d,gh,'gatilho'),/gatilho/);
  assert.throws(()=>M.connect(d,gh,gh),/ele mesmo/);
  const k=M.addNode(d,'logic.condition');assert.throws(()=>M.connect(k.def,gh,k.id,undefined)&&M.connect(M.connect(k.def,gh,k.id),k.id,c.id),/caminho da condição/);
});
test('só um gatilho; ids únicos; remover bloco remove suas conexões',()=>{
  let {d,gh}=flow();assert.throws(()=>M.addNode(d,'trigger.schedule'),/só pode ter um gatilho/);
  const a=M.addNode(d,'github.report');assert.equal(a.id,'github2');
  d=M.removeNode(a.def,gh);assert.equal(d.edges.length,0);assert.ok(!d.nodes.some(n=>n.id===gh));
  const solo=M.removeNode(M.newFlow(),'gatilho');const s=M.addNode(solo,'trigger.schedule');assert.equal(validateDefinition(s.def).triggerType,'schedule');
});
test('variáveis oferecidas: dados do gatilho e saídas só de blocos anteriores',()=>{
  let {d,gh}=flow();const c=M.addNode(d,'logic.set');d=M.connect(c.def,gh,c.id);
  const opts=M.variableOptions(d,c.id).map(o=>o.value);
  assert.ok(opts.includes('{{ trigger.repository }}'));assert.ok(opts.includes(`{{ steps.${gh}.output.summary }}`));
  assert.ok(!M.variableOptions(d,gh).some(o=>o.value.includes(`steps.${c.id}`)));
  for(const o of opts)assert.equal(validateDefinition(M.updateNode(d,c.id,{config:{values:{x:o}}})).ok,true,o);
});
test('conversão de texto e exibição de valores',()=>{
  assert.equal(M.coerce(' 30 '),30);assert.equal(M.coerce('octocat/x'),'octocat/x');assert.equal(M.coerce('{{ trigger.n }}'),'{{ trigger.n }}');
  assert.equal(M.show(30),'30');assert.equal(M.show(undefined),'');assert.equal(M.show({a:1}),'{"a":1}');
});
test('posições: grade, auto-organizar e portas da condição',()=>{
  assert.equal(M.snap(17),12);assert.equal(M.snap(-5),0);
  let {d}=flow();const laid=M.autoLayout(M.ensurePositions({...d,nodes:d.nodes.map(n=>({...n,position:undefined}))}));
  assert.ok(laid.nodes.every(n=>n.position));assert.ok(laid.nodes[1].position!.x>laid.nodes[0].position!.x);
  const k=M.addNode(M.newFlow(),'logic.condition');const n=k.def.nodes[1];
  assert.ok(M.outPort(n,'true').y<M.outPort(n,'false').y);
  const moved=M.moveNode(d,'gatilho',101,59);assert.deepEqual(moved.nodes[0].position,{x:96,y:60});
});
test('erros do servidor identificam o bloco para destacar no mapa',()=>{
  const {d,gh}=flow();const bad=M.updateNode(d,gh,{config:{repository:'',days:15}});
  const v=validateDefinition(bad);assert.equal(v.ok,false);assert.ok(M.errorNodes(v.errors).has(gh));
});
