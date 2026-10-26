import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

// Credenciais ficam criptografadas (AES-256-GCM) no banco. A chave mestra NUNCA vai para o banco:
// vem de TECTIQUE_MASTER_KEY (32 bytes em base64) ou de um arquivo local criado automaticamente.
let cached:Buffer|undefined;
export function masterKey():Buffer{
  if(cached)return cached;
  const fromEnv=process.env.TECTIQUE_MASTER_KEY?.trim();
  if(fromEnv){
    const key=Buffer.from(fromEnv,'base64');
    if(key.length!==32)throw new Error('TECTIQUE_MASTER_KEY deve conter 32 bytes em base64.');
    return cached=key;
  }
  const file=process.env.TECTIQUE_KEY_FILE||fileURLToPath(new URL('../../../.local/master.key',import.meta.url));
  if(!existsSync(file)){
    mkdirSync(dirname(file),{recursive:true});
    try{writeFileSync(file,randomBytes(32).toString('base64'),{mode:0o600,flag:'wx'});}catch{/* outro processo criou primeiro */}
  }
  const key=Buffer.from(readFileSync(file,'utf8').trim(),'base64');
  if(key.length!==32)throw new Error('Arquivo de chave mestra inválido: '+file);
  return cached=key;
}
export function resetMasterKeyCache(){cached=undefined;}

// O workspaceId entra como dado autenticado: um segredo copiado para outro workspace não decifra.
export function encryptSecret(plain:string,workspaceId:string):string{
  const iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',masterKey(),iv);
  cipher.setAAD(Buffer.from(workspaceId));
  const data=Buffer.concat([cipher.update(plain,'utf8'),cipher.final()]);
  return ['v1',iv.toString('base64'),cipher.getAuthTag().toString('base64'),data.toString('base64')].join(':');
}
export function decryptSecret(encoded:string,workspaceId:string):string{
  const [version,iv,tag,data]=encoded.split(':');
  if(version!=='v1'||!iv||!tag||!data)throw new Error('Credencial em formato desconhecido.');
  const decipher=createDecipheriv('aes-256-gcm',masterKey(),Buffer.from(iv,'base64'));
  decipher.setAAD(Buffer.from(workspaceId));
  decipher.setAuthTag(Buffer.from(tag,'base64'));
  try{return Buffer.concat([decipher.update(Buffer.from(data,'base64')),decipher.final()]).toString('utf8');}
  catch{throw new Error('Não foi possível decifrar a credencial (chave mestra diferente ou dado alterado).');}
}

// Remove segredos de qualquer coisa que será gravada em histórico, relatórios ou logs.
const SENSITIVE_KEY=/(token|secret|password|senha|authorization|api[-_]?key|cookie|credential)/i;
const TOKEN_PATTERN=/(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|Bearer\s+[A-Za-z0-9._~+/=-]{12,}|sk-[A-Za-z0-9_-]{16,})/g;
export function redact(value:unknown,known:Iterable<string>=[],depth=0):any{
  const secrets=[...known].filter(s=>s.length>0);
  if(typeof value==='string'){
    let text=value.replace(TOKEN_PATTERN,'[oculto]');
    for(const s of secrets)text=text.split(s).join('[oculto]');
    return text.length>10_000?text.slice(0,10_000)+'…':text;
  }
  if(value===null||typeof value!=='object')return value;
  if(depth>8)return '[profundidade máxima]';
  if(Array.isArray(value))return value.slice(0,500).map(v=>redact(v,secrets,depth+1));
  return Object.fromEntries(Object.entries(value).slice(0,200).map(([k,v])=>[k,SENSITIVE_KEY.test(k)&&v!==null&&v!==''&&typeof v!=='object'?'[oculto]':redact(v,secrets,depth+1)]));
}
