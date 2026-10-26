import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {createApp} from '../src/app.js';
import {hashPassword,verifyPassword} from '../src/auth.js';
import {createGitHubService,normalizeRepository} from '../src/github.js';

test('scrypt armazena hashes diferentes para a mesma senha',async()=>{
 const a=await hashPassword('Senha@123456');const b=await hashPassword('Senha@123456');
 assert.notEqual(a,b);assert.equal(await verifyPassword('Senha@123456',a),true);
 assert.equal(await verifyPassword('invalida',a),false);
});
test('protecao de rotas anonimas sem conectar no banco',async()=>{
 const pool={query:async()=>({rows:[{status:'ok'}]})} as any;
 const app=createApp(pool);
 await request(app).get('/api/reports').expect(401);
 await request(app).get('/api/routines').expect(401);
 await request(app).get('/api/github/summary?repository=octocat/Hello-World').expect(401);
 await request(app).get('/api/health').expect(200);
 await request(app).get('/api/health').set('Origin','https://externo.example').expect(403);
});
test('GitHub diferencia issues, PRs e cache',async()=>{
 let calls=0;const svc=createGitHubService((async(input:any)=>{
   calls++;const url=String(input);
   if(url.includes('/commits?'))return Response.json([]);
   if(url.includes('/issues?'))return Response.json([{number:1,title:'Issue',user:{login:'x'},updated_at:'2026-10-24',state:'open'},{number:2,title:'PR',pull_request:{},user:{login:'y'},updated_at:'2026-10-24',state:'open'}]);
   return Response.json({private:false,full_name:'a/b',default_branch:'main'});
 }) as typeof fetch);
 const r=await svc('a/b',30);assert.equal(r.issues.length,1);assert.equal(r.pull_requests.length,1);
 await svc('a/b',30);assert.equal(calls,3);
});
test('nao aceita URLs externas do GitHub',()=>{
 assert.equal(normalizeRepository('https://github.com/octocat/Hello-World'),'octocat/Hello-World');
 for(const input of ['https://example.com/a/b','a/../b','a/b/extra'])assert.throws(()=>normalizeRepository(input));
});
