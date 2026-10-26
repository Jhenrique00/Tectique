import {createPool,migrate} from './db.js';
import {createApp} from './app.js';
import {startScheduler} from './scheduler.js';
import {startEngine} from './engine/executor.js';
import {githubReport} from './github.js';
import express from 'express';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
export async function startServer(connectionString:string,serveFrontend=false){
  const pool=createPool(connectionString);
  try{await migrate(pool);}catch(e){await pool.end();throw e;}
  const hooks={nudge:()=>{}};
  const app=createApp(pool,githubReport,hooks);
  if(serveFrontend){
    const frontend=fileURLToPath(new URL('../../frontend/dist/',import.meta.url));
    if(!existsSync(frontend)){await pool.end();throw new Error('Compile com npm run build antes de iniciar.');}
    app.use(express.static(frontend));
  }
  const server=await new Promise<ReturnType<typeof app.listen>>((resolve,reject)=>{
    const s=app.listen(8000,'127.0.0.1',()=>resolve(s));s.on('error',reject);
  }).catch(async e=>{await pool.end();throw e;});
  const stopScheduler=startScheduler(pool);
  const engine=startEngine(pool,{reportService:githubReport});
  hooks.nudge=engine.nudge;
  console.log('Tectique API: http://127.0.0.1:8000');
  return async()=>{
    await stopScheduler();
    await engine.stop();
    // Stop admitting new requests, then finish active work before ending DB pool.
    await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
    await pool.end();
  };
}
