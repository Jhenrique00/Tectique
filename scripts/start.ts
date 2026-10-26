import {startDatabase} from './database.js';
import {startServer} from '../server/src/index.js';
import {emitKeypressEvents} from 'node:readline';

let database:Awaited<ReturnType<typeof startDatabase>>|undefined;
let closeServer:(()=>Promise<void>|void)|undefined;
let stopping=false;
function message(e:unknown){if(e instanceof Error)return e.stack||e.message;if(typeof e==='string')return e;try{return JSON.stringify(e)||String(e);}catch{return String(e);}}
async function shutdown(code=0){
  if(stopping)return;stopping=true;
  console.log('\nEncerrando o servidor e depois o PostgreSQL...');
  if(process.stdin.isTTY&&process.stdin.isRaw)process.stdin.setRawMode(false);
  process.stdin.pause();
  try{await closeServer?.();}catch(e){code=1;console.error('Servidor:',message(e));}
  try{await database?.stop();}catch(e){code=1;console.error('PostgreSQL:',message(e));}
  console.log(code===0?'Tectique encerrada com seguranca.':'Encerramento incompleto. Confira os erros acima.');
  process.exitCode=code;
}
// Raw terminal mode consumes Ctrl+C in this process instead of sending a console-wide
// Ctrl+C event to PostgreSQL and breaking active database connections on Windows.
if(process.stdin.isTTY&&typeof process.stdin.setRawMode==='function'){
  emitKeypressEvents(process.stdin);process.stdin.setRawMode(true);process.stdin.resume();
  process.stdin.on('keypress',(_text,key)=>{if(key?.ctrl&&key?.name==='c')void shutdown();});
}
process.on('SIGINT',()=>void shutdown());
process.on('SIGTERM',()=>void shutdown());
try{
  database=await startDatabase();
  closeServer=await startServer(database.url,true);
  console.log('Tectique pronta: http://127.0.0.1:8000');
  console.log('PARA FECHAR: pressione Ctrl+C uma vez nesta janela.');
}catch(e){console.error('Falha ao iniciar:',message(e));await shutdown(1);}
