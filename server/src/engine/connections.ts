import {lookup} from 'node:dns/promises';
import {request} from 'node:https';
import {connect as tcpConnect,type Socket} from 'node:net';
import {connect as tlsConnect} from 'node:tls';
import ipaddr from 'ipaddr.js';
import nodemailer from 'nodemailer';
import {z} from 'zod';
import type {BlockContext} from './blocks.js';

const host=z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/).max(253);
export const httpCredential=z.object({host,token:z.string().max(3000).optional(),header:z.enum(['Authorization','X-API-Key']).default('Authorization')}).strict();
export const smtpCredential=z.object({host,port:z.union([z.literal(465),z.literal(587)]).default(465),user:z.string().min(1).max(254),password:z.string().min(1).max(2000),from:z.email().max(254)}).strict();
export function parseConnection(kind:string,secret:string){
  try{return (kind==='http'?httpCredential:smtpCredential).parse(JSON.parse(secret));}
  catch{throw new Error(kind==='http'?'Conexão HTTP inválida: informe host, token opcional e header.':'Conexão SMTP inválida: informe host, port (465 ou 587), user, password e from.');}
}
export function publicAddress(address:string):boolean{
  try{const ip=ipaddr.parse(address);return ip.range()==='unicast' && !(ip.kind()==='ipv6' && (ip as ipaddr.IPv6).isIPv4MappedAddress());}catch{return false;}
}
// Verifica TODAS as respostas DNS e conecta ao IP aprovado, sem uma segunda resolução.
export async function publicTarget(hostname:string){
  const addresses=await lookup(hostname,{all:true});
  if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw new Error('Destino bloqueado: use um servidor público, fora da rede local.');
  return addresses[0];
}
export function checkedUrl(raw:string,allowedHost:string){
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.username||url.password||url.hash||(url.port&&url.port!=='443')||url.hostname!==allowedHost)
    throw new Error('Use HTTPS na porta 443 e o mesmo host autorizado na conexão, sem usuário ou senha na URL.');
  return url;
}
export async function httpCall(ctx:BlockContext,c:any){
  const cred=httpCredential.parse(parseConnection('http',await ctx.credential(c.connection,'http')));
  const url=checkedUrl(c.url,cred.host),target=await publicTarget(cred.host);
  ctx.signal.throwIfAborted();
  const headers:Record<string,string>={Accept:'application/json','Accept-Encoding':'identity','User-Agent':'Tectique/0.8'};
  if(cred.token)headers[cred.header]=cred.header==='Authorization'?`Bearer ${cred.token}`:cred.token;
  const body=['GET','HEAD'].includes(c.method)?undefined:JSON.stringify(c.body??{});
  if(body&&Buffer.byteLength(body)>32000)throw new Error('Corpo HTTP excede 32 KB.');
  if(body){headers['Content-Type']='application/json';headers['Content-Length']=String(Buffer.byteLength(body));}
  return new Promise<{output:unknown}>((resolve,reject)=>{
    const req=request(url,{method:c.method,headers,signal:ctx.signal,agent:false,
      lookup:((_h:any,o:any,cb:any)=>o?.all?cb(null,[target]):cb(null,target.address,target.family)) as any},res=>{
      const status=res.statusCode??0;
      if(status<200||status>=300){res.destroy();reject(new Error(`O destino respondeu HTTP ${status}. Redirecionamentos não são seguidos.`));return;}
      const chunks:Buffer[]=[];let size=0;
      res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>128000){res.destroy();reject(new Error('Resposta HTTP excede 128 KB.'));}else chunks.push(chunk);});
      res.on('error',()=>reject(new Error('A resposta HTTP foi interrompida.')));
      res.on('end',()=>{const text=Buffer.concat(chunks).toString('utf8');let data:unknown=text;try{data=JSON.parse(text);}catch{}
        resolve({output:{status,body:data}});});
    });
    req.on('error',()=>reject(new Error('Falha na conexão HTTPS ou tempo limite atingido.')));
    req.setTimeout(20000,()=>req.destroy());req.end(body);
  });
}
export async function sendEmail(ctx:BlockContext,c:any){
  const cred=smtpCredential.parse(parseConnection('smtp',await ctx.credential(c.connection,'smtp')));
  const target=await publicTarget(cred.host);ctx.signal.throwIfAborted();
  let socket:Socket|undefined;
  const transport=nodemailer.createTransport({host:target.address,port:cred.port,secure:cred.port===465,requireTLS:true,
    tls:{servername:cred.host,minVersion:'TLSv1.2',rejectUnauthorized:true},auth:{user:cred.user,pass:cred.password},
    connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000,disableFileAccess:true,disableUrlAccess:true,
    getSocket:(_options:any,callback:any)=>{
      if(ctx.signal.aborted){callback(new Error('Envio cancelado.'));return;}
      const secure=cred.port===465;
      socket=secure?tlsConnect({host:target.address,port:cred.port,servername:cred.host,minVersion:'TLSv1.2',rejectUnauthorized:true})
        :tcpConnect({host:target.address,port:cred.port});
      let called=false;
      const finish=(error?:Error)=>{if(called)return;called=true;clearTimeout(timer);callback(error??null,error?undefined:{connection:socket,secured:secure});};
      const timer=setTimeout(()=>socket?.destroy(new Error('Tempo limite SMTP.')),10000);
      socket.once(secure?'secureConnect':'connect',()=>finish());socket.once('error',finish);
    }});
  const abort=()=>{socket?.destroy(new Error('Envio cancelado.'));transport.close();};ctx.signal.addEventListener('abort',abort,{once:true});
  try{
    const result=await transport.sendMail({from:cred.from,to:c.to,subject:c.subject,text:c.text,
      disableFileAccess:true,disableUrlAccess:true});
    if(!result.accepted.length)throw new Error('rejected');
    return {output:{accepted:result.accepted,message_id:result.messageId,status:'accepted'}};
  }catch{throw new Error('O SMTP não confirmou o envio. Confira a conexão; antes de repetir, verifique se a mensagem já chegou.');}
  finally{ctx.signal.removeEventListener('abort',abort);socket?.destroy();transport.close();}
}
