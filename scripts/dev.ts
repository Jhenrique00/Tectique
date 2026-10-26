import { startDatabase,root } from './database.js';
import { startServer } from '../server/src/index.js';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const db=await startDatabase();
let closeServer:(()=>Promise<void>)|undefined;
let stopping=false;
let child:ReturnType<typeof spawn>|undefined;
async function stop(code=0) {
  if(stopping)return;stopping=true;
  child?.kill();
  try {await closeServer?.();await db.stop();} finally {process.exit(code);}
}
process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop());
try {
  closeServer=await startServer(db.url);
  child=spawn(process.execPath,[resolve(root,'frontend/node_modules/vite/bin/vite.js'),'--host','127.0.0.1'],{cwd:resolve(root,'frontend'),stdio:'inherit',windowsHide:true});
  child.on('exit',code=>void stop(code??0));child.on('error',()=>void stop(1));
} catch(e) {console.error(e instanceof Error?e.message:'Falha ao iniciar.');await stop(1);}
