import { startDatabase,root } from './database.js';
import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const db=await startDatabase();
const admin=new pg.Client({connectionString:db.url});
let failed=false;
try {
  await admin.connect();
  // Cada arquivo de teste usa um banco temporário próprio, para um não interferir no outro.
  for(const file of ['server/test/app.test.ts','server/test/engine.test.ts','server/test/webhooks.test.ts','server/test/crm.test.ts']){
    const name='tectique_test_'+randomBytes(8).toString('hex');
    await admin.query(`CREATE DATABASE ${name} ENCODING 'UTF8' TEMPLATE template0`);
    try {
      const url=new URL(db.url);url.pathname='/'+name;
      const code=await new Promise<number>((done,reject)=>{
        const child=spawn(process.execPath,['--import','tsx','--test','--test-concurrency=1',resolve(root,file)],{cwd:root,env:{...process.env,TEST_DATABASE_URL:url.href},stdio:'inherit',windowsHide:true});
        child.on('exit',c=>done(c??1));child.on('error',reject);
      });
      if(code!==0)failed=true;
    } finally {await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);}
  }
  process.exitCode=failed?1:0;
} finally {await admin.end();await db.stop();}
