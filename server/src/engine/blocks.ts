import {z} from 'zod';
import type pg from 'pg';
import {saveReport} from '../db.js';
import type {ReportService} from '../scheduler.js';
import {httpCall,sendEmail} from './connections.js';
import {captureContact,captureInput} from '../crm.js';

export type BlockCategory='trigger'|'action'|'logic';
export interface BlockContext{
  pool:pg.Pool;workspaceId:string;userId:string|null;signal:AbortSignal;reportService:ReportService;
  credential(name:string,kind?:string):Promise<string>;
}
export interface BlockResult{output:unknown;branch?:'true'|'false'}
export interface Block{
  type:string;label:string;description:string;category:BlockCategory;schema:z.ZodType;timeoutMs?:number;
  run(ctx:BlockContext,config:any,input:any):Promise<BlockResult>;
}
const registry=new Map<string,Block>();
export const registerBlock=(block:Block)=>{registry.set(block.type,block);};
export const getBlock=(type:string)=>registry.get(type);
export function listBlocks(){
  return [...registry.values()].map(b=>{
    let config_schema:unknown=null;
    try{config_schema=z.toJSONSchema(b.schema,{unrepresentable:'any',io:'input'});}catch{/* sem esquema descritivo */}
    return {type:b.type,label:b.label,description:b.description,category:b.category,config_schema};
  });
}

// ---- Variáveis: {{ trigger.campo }} e {{ steps.<bloco>.output.campo }} (sem eval, sem código arbitrário) ----
export class TemplateError extends Error{}
const FULL=/^\s*\{\{\s*([^{}]+?)\s*\}\}\s*$/;
const ANY=/\{\{\s*([^{}]+?)\s*\}\}/g;
const BLOCKED=new Set(['__proto__','constructor','prototype']);
export function lookup(path:string,scope:any):any{
  let current=scope;
  for(const key of path.split('.')){
    if(!key||BLOCKED.has(key)||current===null||typeof current!=='object'||!Object.hasOwn(current,key))
      throw new TemplateError(`A variável "${path}" não existe neste ponto do fluxo.`);
    current=current[key];
  }
  return current;
}
export function resolveTemplates(value:any,scope:any,depth=0):any{
  if(depth>10)throw new TemplateError('Configuração aninhada demais.');
  if(typeof value==='string'){
    const full=FULL.exec(value);
    if(full)return lookup(full[1],scope);
    return value.replace(ANY,(_,path)=>{const v=lookup(path,scope);return typeof v==='string'?v:JSON.stringify(v);});
  }
  if(Array.isArray(value))return value.map(v=>resolveTemplates(v,scope,depth+1));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,resolveTemplates(v,scope,depth+1)]));
  return value;
}
export function templateReferences(value:any,found:string[]=[]):string[]{
  if(typeof value==='string')for(const m of value.matchAll(ANY))found.push(m[1]);
  else if(Array.isArray(value))value.forEach(v=>templateReferences(v,found));
  else if(value&&typeof value==='object')Object.values(value).forEach(v=>templateReferences(v,found));
  return found;
}

// ---- Condição ----
const num=(v:any)=>typeof v==='number'?v:(typeof v==='string'&&v.trim()!==''&&!Number.isNaN(Number(v))?Number(v):NaN);
export function evaluate(op:string,left:any,right:any):boolean{
  switch(op){
    case 'exists':return left!==undefined&&left!==null&&left!=='';
    case 'contains':return Array.isArray(left)?left.some(x=>String(x)===String(right)):String(left??'').includes(String(right??''));
    case 'eq':case 'ne':{
      const a=num(left),b=num(right);
      const equal=!Number.isNaN(a)&&!Number.isNaN(b)?a===b:String(left)===String(right);
      return op==='eq'?equal:!equal;
    }
    default:{
      const a=num(left),b=num(right);
      if(Number.isNaN(a)||Number.isNaN(b))throw new Error('A comparação numérica exige dois números.');
      return op==='gt'?a>b:op==='gte'?a>=b:op==='lt'?a<b:a<=b;
    }
  }
}

// ---- Blocos desta etapa ----
registerBlock({type:'crm.contact',label:'Cadastrar ou atualizar contato',category:'action',description:'Salva no CRM deste workspace. Usa o e-mail para encontrar o contato e preserva a etapa comercial.',schema:captureInput,
  async run(ctx,config){ctx.signal.throwIfAborted();return {output:await captureContact(ctx.pool,ctx.workspaceId,ctx.userId,config)};}});
registerBlock({type:'trigger.webhook',label:'Webhook',category:'trigger',description:'Recebe JSON por POST autenticado. Salve e ative o webhook no painel do editor.',schema:z.object({}),
  async run(_ctx,_config,input){return {output:input??{}};}});
registerBlock({type:'http.request',label:'Requisição HTTP',category:'action',description:'Chama uma API HTTPS autorizada pela conexão do workspace. Não segue redirecionamentos.',
  schema:z.object({connection:z.string().min(1).max(60),url:z.url().max(2048),method:z.enum(['GET','POST','PUT','PATCH','DELETE','HEAD']).default('GET'),body:z.record(z.string(),z.any()).default({})}),run:httpCall});
registerBlock({type:'email.send',label:'Enviar e-mail',category:'action',description:'Envia texto por SMTP com TLS. A confirmação indica aceite do servidor, não entrega na caixa de entrada.',
  schema:z.object({connection:z.string().min(1).max(60),to:z.email().max(254),subject:z.string().min(1).max(200).refine(v=>!/[\r\n]/.test(v),'Assunto não pode conter quebras de linha.'),text:z.string().min(1).max(16000)}),run:sendEmail});
registerBlock({
  type:'trigger.manual',label:'Gatilho manual',category:'trigger',
  description:'Inicia o fluxo quando você clica em executar. Valores padrão podem ser sobrescritos a cada execução.',
  schema:z.object({defaults:z.record(z.string().min(1).max(64),z.any()).default({})}),
  async run(_ctx,config,input){return {output:{...config.defaults,...(input??{})}};},
});
registerBlock({
  type:'trigger.schedule',label:'Agendamento',category:'trigger',
  description:'Inicia o fluxo automaticamente a cada 1, 6, 12 ou 24 horas, enquanto o servidor estiver ativo.',
  schema:z.object({interval_hours:z.coerce.number().refine(v=>[1,6,12,24].includes(v),'Use 1, 6, 12 ou 24 horas.')}),
  async run(){return {output:{scheduled_for:new Date().toISOString()}};},
});
registerBlock({
  type:'github.report',label:'GitHub Analytics',category:'action',timeoutMs:60_000,
  description:'Consulta um repositório público do GitHub e salva o relatório no histórico da conta.',
  schema:z.object({
    repository:z.string().trim().min(3).max(250),
    days:z.coerce.number().refine(v=>[7,30,90].includes(v),'Use 7, 30 ou 90 dias.'),
  }),
  async run(ctx,config){
    const report=await ctx.reportService(config.repository,config.days);
    // Sem responsável (conta removida) o relatório não é salvo: evita associá-lo à conta errada.
    if(ctx.userId)await saveReport(ctx.pool,report,ctx.userId);
    return {output:{
      repository:report.repository,days:report.days,summary:report.summary,generated_at:report.generated_at,partial:report.partial,
      commits:report.commits.length,issues:report.issues.length,pull_requests:report.pull_requests.length,
    }};
  },
});
registerBlock({
  type:'logic.condition',label:'Condição (SE/SENÃO)',category:'logic',
  description:'Segue pelo caminho "verdadeiro" ou "falso" conforme a comparação entre dois valores.',
  schema:z.object({
    left:z.any(),
    operator:z.enum(['eq','ne','gt','gte','lt','lte','contains','exists']),
    right:z.any().optional(),
  }),
  async run(_ctx,config){
    const result=evaluate(config.operator,config.left,config.right);
    return {output:{result},branch:result?'true':'false'};
  },
});
registerBlock({
  type:'logic.set',label:'Definir variáveis',category:'logic',
  description:'Cria ou transforma valores para usar nos próximos blocos.',
  schema:z.object({values:z.record(z.string().min(1).max(64),z.any()).refine(v=>Object.keys(v).length<=50,'No máximo 50 variáveis.')}),
  async run(_ctx,config){return {output:config.values};},
});
