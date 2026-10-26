import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {createPool,migrate} from '../src/db.js';
import {createApp} from '../src/app.js';
import {createGitHubService,normalizeRepository} from '../src/github.js';
import {hashPassword,verifyPassword} from '../src/auth.js';
import {AppError} from '../src/security.js';

const pool=createPool(process.env.TEST_DATABASE_URL!);
const sample={repository:'octocat/Hello-World',repository_url:'https://github.com/octocat/Hello-World',description:null,
  default_branch:'main',days:30,since:'2026-09-24T00:00:00Z',generated_at:'2026-10-24T00:00:00Z',
  commits:[],issues:[],pull_requests:[],partial:false,notes:[],summary:'Sem itens.'};
const app=createApp(pool,async()=>sample);
const alice=request.agent(app);const bob=request.agent(app);
let aliceReportId='';let aliceRoutineId='';
before(async()=>{await migrate(pool);await migrate(pool);});after(async()=>pool.end());
test('health e bloqueio de acesso anonimo',async()=>{
  const r=await request(app).get('/api/health').expect(200);assert.equal(r.body.database,'postgresql');
  for(const path of ['/api/reports','/api/github/summary?repository=a/b','/api/routines','/api/auth/me'])await request(app).get(path).expect(401);
});
test('senhas usam scrypt com salt unico',async()=>{
  const a=await hashPassword('SenhaForte@123');const b=await hashPassword('SenhaForte@123');
  assert.notEqual(a,b);assert.equal(await verifyPassword('SenhaForte@123',a),true);assert.equal(await verifyPassword('errada',a),false);
});
test('cadastro cria primeira conta e login valida senha',async()=>{
  const r=await alice.post('/api/auth/register').send({name:'Alice',email:'ALICE@example.com',password:'SenhaForte@123'}).expect(201);
  assert.equal(r.body.user.email,'alice@example.com');assert.match(String(r.headers['set-cookie']),/HttpOnly/);
  await bob.post('/api/auth/register').send({name:'Bob',email:'bob@example.com',password:'SenhaBob@123'}).expect(201);
  await request(app).post('/api/auth/login').send({email:'alice@example.com',password:'errada-123'}).expect(401);
  await request(app).post('/api/auth/register').send({name:'Duplicate',email:'alice@example.com',password:'abcdefgh'}).expect(409);
  const who=await alice.get('/api/auth/me').expect(200);assert.equal(who.body.user.name,'Alice');
});
test('historico persistente e isolado entre contas, inclusive acesso por UUID',async()=>{
  await alice.get('/api/github/summary?repository=octocat/Hello-World&days=30').expect(200);
  const first=await alice.get('/api/reports').expect(200);assert.equal(first.body.total,1);aliceReportId=first.body.items[0].id;
  assert.equal((await bob.get('/api/reports').expect(200)).body.total,0);
  await bob.get('/api/reports/'+aliceReportId).expect(404);
  await alice.get('/api/reports/'+aliceReportId).expect(200);
  const secondPool=createPool(process.env.TEST_DATABASE_URL!);
  try{assert.equal((await secondPool.query('SELECT count(*)::integer AS n FROM tectique_reports WHERE user_id IS NOT NULL')).rows[0].n,1);}finally{await secondPool.end();}
  await bob.get('/api/github/summary?repository=octocat/Hello-World&days=30').expect(200);
  assert.equal((await bob.get('/api/reports').expect(200)).body.total,1);
  assert.equal((await alice.get('/api/reports').expect(200)).body.total,1);
});
test('rotinas: criar, pausar, reativar, executar agora e excluir somente as proprias',async()=>{
  const created=await alice.post('/api/routines').send({repository:'https://github.com/octocat/Hello-World',days:30,interval_hours:6}).expect(201);
  aliceRoutineId=created.body.routine.id;assert.equal(created.body.routine.repository,'octocat/Hello-World');
  assert.equal(created.body.routine.enabled,true);assert.ok(created.body.routine.next_run_at);
  await bob.patch(`/api/routines/${aliceRoutineId}`).send({enabled:false}).expect(404);
  await bob.post(`/api/routines/${aliceRoutineId}/run`).expect(404);
  await bob.delete(`/api/routines/${aliceRoutineId}`).expect(404);
  const paused=await alice.patch(`/api/routines/${aliceRoutineId}`).send({enabled:false}).expect(200);
  assert.equal(paused.body.routine.next_run_at,null);assert.equal(paused.body.routine.enabled,false);
  const resumed=await alice.patch(`/api/routines/${aliceRoutineId}`).send({enabled:true}).expect(200);
  assert.equal(resumed.body.routine.enabled,true);
  await alice.post(`/api/routines/${aliceRoutineId}/run`).expect(200);
  const found=await alice.get('/api/routines').expect(200);assert.equal(found.body.items.length,1);
  assert.equal((await bob.get('/api/routines').expect(200)).body.items.length,0);
  await alice.delete(`/api/routines/${aliceRoutineId}`).expect(204);
  assert.equal((await alice.get('/api/routines').expect(200)).body.items.length,0);
});
test('valida entradas e respeita origem',async()=>{
  await request(app).get('/api/health').set('Origin','https://externo.example').expect(403);
  await alice.get('/api/reports?limit=-1').expect(422);
  await alice.get('/api/reports/invalido').expect(422);
  await alice.get('/api/github/summary?repository=x/y&days=2').expect(422);
  await alice.post('/api/routines').send({repository:'a/b',days:30,interval_hours:2}).expect(422);
  await request(app).post('/api/auth/register').send({name:'X',email:'wrong',password:'short'}).expect(422);
});
test('logout revoga sessao no servidor',async()=>{
  await alice.post('/api/auth/logout').expect(200);
  await alice.get('/api/reports').expect(401);
  await alice.post('/api/auth/login').send({email:'alice@example.com',password:'SenhaForte@123'}).expect(200);
  await alice.get('/api/reports').expect(200);
});
test('GitHub: normaliza enderecos e bloqueia nomes inseguros',()=>{
  assert.equal(normalizeRepository('https://github.com/a/b.git'),'a/b');
  for(const x of ['https://example.com/a/b','a/..','a/b/extra','https://github.com@evil.test/a/b','https://github.com/a/b?x=1'])assert.throws(()=>normalizeRepository(x));
});
test('GitHub: cache, issues e PRs separadas',async()=>{
  let calls=0;const service=createGitHubService((async(input:any)=>{
    calls++;const u=String(input);const body=u.includes('/commits?')?[]:u.includes('/issues?')?
      [{number:1,title:'Issue',user:{login:'a'},updated_at:'2026-10-24',state:'open'},
        {number:2,title:'PR',pull_request:{},user:{login:'a'},updated_at:'2026-10-24',state:'closed'}]:
      {private:false,full_name:'a/b',default_branch:'main',description:null};return Response.json(body);
  }) as typeof fetch);
  const report=await service('a/b',7);assert.equal(report.issues.length,1);assert.equal(report.pull_requests.length,1);
  await service('a/b',7);assert.equal(calls,3);
});
test('GitHub: nunca aceita redirecionamento externo',async()=>{
  const service=createGitHubService((async()=>new Response(null,{status:301,headers:{location:'https://evil.test/'}})) as typeof fetch);
  await assert.rejects(service('a/b',30),/externo/);
});
test('GitHub: erros de API nao se transformam em relatorios vazios',async()=>{
  for(const status of [401,403,404,429,500]){
    const service=createGitHubService((async()=>Response.json({message:'erro'},{status})) as typeof fetch);
    await assert.rejects(service('a/b',30),e=>e instanceof AppError);
  }
});
