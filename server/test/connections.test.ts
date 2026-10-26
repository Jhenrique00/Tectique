import {test,afterEach,mock} from 'node:test';
import assert from 'node:assert/strict';
import dns from 'node:dns/promises';
import https from 'node:https';
import {syncBuiltinESMExports} from 'node:module';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import nodemailer from 'nodemailer';
import {publicAddress,publicTarget,checkedUrl,parseConnection,httpCall,sendEmail} from '../src/engine/connections.js';
import {validateDefinition} from '../src/engine/definition.js';
afterEach(()=>{mock.restoreAll();syncBuiltinESMExports();});
function dnsResult(addresses=['93.184.216.34']){mock.method(dns,'lookup',async()=>addresses.map(address=>({address,family:4})));syncBuiltinESMExports();}
const ctx=(data:any,signal=new AbortController().signal)=>({signal,credential:async()=>JSON.stringify(data)}) as any;
test('rede: bloqueia endereços privados, loopback, metadata, multicast e IPv4 mapeado',()=>{
  for(const ip of ['127.0.0.1','10.2.0.1','172.16.0.1','192.168.1.1','169.254.169.254','100.64.1.1','0.0.0.0','224.0.0.1','::1','fc00::1','fe80::1','::ffff:127.0.0.1'])assert.equal(publicAddress(ip),false,ip);
  assert.equal(publicAddress('93.184.216.34'),true);assert.equal(publicAddress('2606:4700:4700::1111'),true);
});
test('DNS misto público/privado é rejeitado; DNS aprovado retorna um IP fixo',async()=>{
  dnsResult();assert.equal((await publicTarget('example.com')).address,'93.184.216.34');
  mock.restoreAll();dnsResult(['93.184.216.34','127.0.0.1']);await assert.rejects(publicTarget('example.com'),/bloqueado/);
});
test('HTTP exige HTTPS, host exato, porta 443 e ausência de credencial na URL',()=>{
  assert.equal(checkedUrl('https://example.com/data?q=1','example.com').pathname,'/data');
  for(const url of ['http://example.com','https://example.com:8000','https://evil.example','https://u:p@example.com','https://example.com/#x'])assert.throws(()=>checkedUrl(url,'example.com'));
});
test('conexões rejeitam chaves arbitrárias e configuração SMTP insegura',()=>{
  assert.throws(()=>parseConnection('http',JSON.stringify({host:'example.com',proxy:'http://localhost'})));
  assert.throws(()=>parseConnection('smtp',JSON.stringify({host:'smtp.example.com',port:25,user:'a',password:'p',from:'a@example.com'})));
  assert.throws(()=>parseConnection('http','invalido'));
});
function fakeHttp(status:number,body:string,inspect?:(o:any)=>void){
  let calls=0;
  mock.method(https,'request',(_url:any,options:any,callback:any)=>{
    calls++;inspect?.(options);const req=new EventEmitter() as any;
    req.setTimeout=()=>{};req.destroy=()=>req.emit('error',new Error('network'));
    req.end=()=>queueMicrotask(()=>{const res=Readable.from([Buffer.from(body)]) as any;res.statusCode=status;callback(res);});return req;
  });syncBuiltinESMExports();return ()=>calls;
}
test('HTTP retorna JSON e status, fixa DNS e envia token somente ao host autorizado',async()=>{
  dnsResult();fakeHttp(200,'{"ok":true}',o=>{assert.equal(o.headers.Authorization,'Bearer hidden-token');assert.equal(o.agent,false);o.lookup('example.com',{},(_e:any,address:string)=>assert.equal(address,'93.184.216.34'));o.lookup('example.com',{all:true},(_e:any,addresses:any[])=>assert.deepEqual(addresses,[{address:'93.184.216.34',family:4}]));});
  const result=await httpCall(ctx({host:'example.com',token:'hidden-token'}),{url:'https://example.com/api',method:'GET'});
  assert.deepEqual(result.output,{status:200,body:{ok:true}});
});
test('HTTP bloqueia redirecionamento sem nova chamada e limita resposta',async()=>{
  dnsResult();const calls=fakeHttp(302,'');await assert.rejects(httpCall(ctx({host:'example.com'}),{url:'https://example.com',method:'GET'}),/302/);assert.equal(calls(),1);
  mock.restoreAll();dnsResult();fakeHttp(200,'x'.repeat(128001));await assert.rejects(httpCall(ctx({host:'example.com'}),{url:'https://example.com',method:'GET'}),/128 KB/);
});
test('HTTP rejeita corpo acima de 32 KB e execução cancelada',async()=>{
  dnsResult();await assert.rejects(httpCall(ctx({host:'example.com'}),{url:'https://example.com',method:'POST',body:{x:'a'.repeat(32001)}}),/32 KB/);
  const abort=new AbortController();abort.abort();await assert.rejects(httpCall(ctx({host:'example.com'},abort.signal),{url:'https://example.com',method:'GET'}));
});
test('SMTP usa TLS, remetente autorizado e mensagem em texto sem arquivos externos',async()=>{
  dnsResult();let closed=false;
  mock.method(nodemailer,'createTransport',(o:any)=>{
    assert.equal(o.host,'93.184.216.34');assert.equal(o.tls.servername,'smtp.example.com');assert.equal(o.requireTLS,true);assert.equal(o.tls.rejectUnauthorized,true);
    return {close:()=>{closed=true;},sendMail:async(m:any)=>{assert.equal(m.from,'sender@example.com');assert.equal(m.disableFileAccess,true);assert.equal(m.disableUrlAccess,true);assert.equal(m.text,'Olá!');return {accepted:['client@example.com'],messageId:'id-test'};}} as any;
  });
  const r=await sendEmail(ctx({host:'smtp.example.com',port:587,user:'sender',password:'private',from:'sender@example.com'}),{to:'client@example.com',subject:'Olá',text:'Olá!'});
  assert.equal((r.output as any).status,'accepted');assert.equal(closed,true);
});
test('SMTP não expõe resposta do provedor quando o envio falha',async()=>{
  dnsResult();mock.method(nodemailer,'createTransport',()=>({close(){},async sendMail(){throw new Error('senha=private');}}) as any);
  await assert.rejects(sendEmail(ctx({host:'smtp.example.com',user:'sender',password:'private',from:'sender@example.com'}),{to:'a@example.com',subject:'x',text:'x'}),e=>!String(e).includes('private')&&String(e).includes('SMTP'));
});
test('novos blocos e variáveis passam no validador; assunto com quebra de linha é recusado',()=>{
  const def={nodes:[{id:'t',type:'trigger.webhook',config:{}},{id:'http',type:'http.request',config:{connection:'publica',url:'https://example.com'}},{id:'email',type:'email.send',config:{connection:'correio',to:'{{ trigger.email }}',subject:'Olá',text:'{{ steps.http.output.body }}'}}],edges:[{from:'t',to:'http'},{from:'http',to:'email'}]};
  assert.equal(validateDefinition(def).triggerType,'webhook');def.nodes[2].config.subject='Injeção\r\nBcc: x';assert.equal(validateDefinition(def).ok,false);
});
