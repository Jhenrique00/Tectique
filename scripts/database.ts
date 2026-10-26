import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import dotenv from 'dotenv';
export const root=fileURLToPath(new URL('../',import.meta.url));
dotenv.config({path:fileURLToPath(new URL('../.env',import.meta.url)),quiet:true});
export async function startDatabase() {
  if(process.env.DATABASE_URL) return {url:process.env.DATABASE_URL,stop:async()=>{}};
  const local=new URL('../.local/',import.meta.url);
  mkdirSync(local,{recursive:true});
  const lock=new URL('run.lock',local);
  if(existsSync(lock)) {
    const pid=Number(readFileSync(lock,'utf8'));
    let alive=false; try {process.kill(pid,0);alive=true;} catch {}
    if(alive) throw new Error('A Tectique já está aberta. Feche o outro terminal com Ctrl+C antes de iniciar novamente.');
    unlinkSync(lock);
  }
  writeFileSync(lock,String(process.pid),{flag:'wx'});
  const credentials=new URL('database.json',local);
  const config=existsSync(credentials)?JSON.parse(readFileSync(credentials,'utf8')):{password:randomBytes(24).toString('hex'),port:55433};
  if(!existsSync(credentials)) writeFileSync(credentials,JSON.stringify(config),{mode:0o600});
  const databaseDir=fileURLToPath(new URL('postgres/',local));
  // Windows initdb embeds native path text in its bootstrap SQL. The application
  // database is explicitly UTF8, independent of this bootstrap template encoding.
  const database=new EmbeddedPostgres({databaseDir,user:'tectique',password:config.password,port:config.port,persistent:true,authMethod:'scram-sha-256',initdbFlags:[`--encoding=${process.platform==='win32'?'WIN1252':'UTF8'}`,'--locale=C'],postgresFlags:['-c','listen_addresses=127.0.0.1'],onLog:()=>{},onError:()=>{}});
  let started=false;
  try {
    if(!existsSync(new URL('postgres/PG_VERSION',local))) {console.log('Preparando PostgreSQL local (primeira execução)…');await database.initialise();}
    await database.start();started=true;
    const client=database.getPgClient('postgres','127.0.0.1');
    await client.connect();
    try {if(!(await client.query("SELECT 1 FROM pg_database WHERE datname='tectique'")).rowCount) await client.query("CREATE DATABASE tectique ENCODING 'UTF8' TEMPLATE template0");} finally {await client.end();}
    console.log('PostgreSQL pronto. Seus dados ficam na pasta .local.');
    let stopped=false;
    return {url:`postgresql://tectique:${config.password}@127.0.0.1:${config.port}/tectique`,stop:async()=>{if(stopped)return;stopped=true;try{await database.stop();}finally{if(existsSync(lock))unlinkSync(lock);}}};
  } catch(e) {if(started) await database.stop();if(existsSync(lock))unlinkSync(lock);throw e;}
}
