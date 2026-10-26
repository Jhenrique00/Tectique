// Lógica pura do editor visual (sem React): testável e idêntica ao que o servidor valida.
import type {FlowDefinition} from '../api';
export type Def=FlowDefinition;
export type Node=Def['nodes'][number];
export const NODE_W=200,NODE_H=70,GRID=12;

export const isTrigger=(type:string)=>type.startsWith('trigger.');
export const isCondition=(type:string)=>type==='logic.condition';

// ---- Metadados de tela de cada bloco (formulário do painel lateral) ----
export type Field=
  |{key:string;label:string;kind:'text'|'textarea';placeholder?:string;help?:string}
  |{key:string;label:string;kind:'select';options:{value:string|number;label:string}[]}
  |{key:string;label:string;kind:'pairs';help?:string};
export const BLOCK_UI:Record<string,{short:string;fields:Field[];fresh:()=>Record<string,unknown>;outputs?:(n:Node)=>string[]}>={
  'crm.contact':{short:'contato',fresh:()=>({name:'',email:''}),outputs:()=>['contact_id','name','email','stage','created'],fields:[
    {key:'name',label:'Nome do contato',kind:'text',placeholder:'{{ trigger.name }}'},
    {key:'email',label:'E-mail do contato',kind:'text',placeholder:'{{ trigger.email }}'},
    {key:'phone',label:'Telefone (opcional)',kind:'text'},{key:'company',label:'Empresa (opcional)',kind:'text'},{key:'source',label:'Origem (opcional)',kind:'text'}]},
  'trigger.webhook':{short:'webhook',fresh:()=>({}),fields:[]},
  'http.request':{short:'http',fresh:()=>({connection:'',url:'',method:'GET',body:{}}),outputs:()=>['status','body'],fields:[
    {key:'connection',label:'Nome da conexão HTTP',kind:'text',placeholder:'api-publica'},
    {key:'url',label:'URL HTTPS autorizada',kind:'text',placeholder:'https://api.exemplo.com/dados'},
    {key:'method',label:'Método',kind:'select',options:['GET','POST','PUT','PATCH','DELETE','HEAD'].map(value=>({value,label:value}))},
    {key:'body',label:'Corpo JSON (não usado em GET/HEAD)',kind:'pairs'}]},
  'email.send':{short:'email',fresh:()=>({connection:'',to:'',subject:'',text:''}),outputs:()=>['accepted','message_id','status'],fields:[
    {key:'connection',label:'Nome da conexão SMTP',kind:'text',placeholder:'email-empresa'},
    {key:'to',label:'Destinatário',kind:'text',placeholder:'{{ trigger.email }}'},
    {key:'subject',label:'Assunto',kind:'text'}, {key:'text',label:'Mensagem em texto',kind:'textarea'}]},
  'trigger.manual':{short:'gatilho',fresh:()=>({defaults:{}}),fields:[{key:'defaults',label:'Valores padrão',kind:'pairs',help:'Ficam disponíveis como {{ trigger.nome }}.'}]},
  'trigger.schedule':{short:'agendamento',fresh:()=>({interval_hours:24}),outputs:()=>['scheduled_for'],fields:[
    {key:'interval_hours',label:'Repetir a cada',kind:'select',options:[1,6,12,24].map(h=>({value:h,label:h===1?'1 hora':`${h} horas`}))}]},
  'github.report':{short:'github',fresh:()=>({repository:'',days:30}),outputs:()=>['repository','days','summary','generated_at','partial','commits','issues','pull_requests'],fields:[
    {key:'repository',label:'Repositório público',kind:'text',placeholder:'usuario/repositorio'},
    {key:'days',label:'Período (7, 30 ou 90 dias)',kind:'text',placeholder:'30'}]},
  'logic.condition':{short:'condicao',fresh:()=>({left:'',operator:'eq',right:''}),outputs:()=>['result'],fields:[
    {key:'left',label:'Valor',kind:'text',placeholder:'{{ steps.github.output.commits }}'},
    {key:'operator',label:'Comparação',kind:'select',options:[['eq','é igual a'],['ne','é diferente de'],['gt','é maior que'],['gte','é maior ou igual a'],['lt','é menor que'],['lte','é menor ou igual a'],['contains','contém'],['exists','existe']].map(([value,label])=>({value,label}))},
    {key:'right',label:'Comparar com',kind:'text'}]},
  'logic.set':{short:'variaveis',fresh:()=>({values:{}}),outputs:n=>Object.keys((n.config.values??{}) as object),fields:[{key:'values',label:'Variáveis',kind:'pairs',help:'Ficam disponíveis como {{ steps.este-bloco.output.nome }}.'}]},
};

// Texto digitado → valor guardado (números viram número; o resto, texto).
export const coerce=(text:string):string|number=>/^-?\d+(\.\d+)?$/.test(text.trim())?Number(text.trim()):text;
export const show=(v:unknown):string=>v===undefined||v===null?'':typeof v==='string'?v:typeof v==='object'?JSON.stringify(v):String(v);

const clone=<T,>(v:T):T=>JSON.parse(JSON.stringify(v));
export const snap=(n:number)=>Math.max(0,Math.round(n/GRID)*GRID);
export function uniqueId(def:Def,type:string){
  const base=BLOCK_UI[type]?.short??'bloco';
  if(!def.nodes.some(n=>n.id===base))return base;
  for(let i=2;;i++)if(!def.nodes.some(n=>n.id===base+i))return base+i;
}
export function newFlow():Def{return {nodes:[{id:'gatilho',type:'trigger.manual',config:{defaults:{}},position:{x:36,y:36}}],edges:[]};}

export function freeSpot(def:Def){
  const taken=new Set(def.nodes.map(n=>`${snap(n.position?.x??0)},${snap(n.position?.y??0)}`));
  const last=def.nodes[def.nodes.length-1]?.position;
  let x=last?last.x+NODE_W+48:36,y=last?last.y:36;
  while(taken.has(`${snap(x)},${snap(y)}`))y+=NODE_H+36;
  return {x:snap(x),y:snap(y)};
}
export function addNode(def:Def,type:string,pos?:{x:number;y:number}):{def:Def;id:string}{
  if(!BLOCK_UI[type])throw new Error('Este tipo de bloco ainda não tem formulário no editor.');
  if(isTrigger(type)&&def.nodes.some(n=>isTrigger(n.type)))throw new Error('O fluxo só pode ter um gatilho. Remova o atual para usar outro.');
  const id=uniqueId(def,type),next=clone(def);
  next.nodes.push({id,type,config:BLOCK_UI[type].fresh() as Record<string,any>,position:pos?{x:snap(pos.x),y:snap(pos.y)}:freeSpot(def)});
  return {def:next,id};
}
export function removeNode(def:Def,id:string):Def{const n=clone(def);n.nodes=n.nodes.filter(x=>x.id!==id);n.edges=n.edges.filter(e=>e.from!==id&&e.to!==id);return n;}
export function removeEdge(def:Def,index:number):Def{const n=clone(def);n.edges.splice(index,1);return n;}
export function updateNode(def:Def,id:string,patch:{name?:string;config?:Record<string,any>}):Def{
  const n=clone(def),node=n.nodes.find(x=>x.id===id);if(!node)return def;
  if(patch.name!==undefined)node.name=patch.name||undefined;if(patch.config)node.config=patch.config;return n;
}
export function moveNode(def:Def,id:string,x:number,y:number):Def{const n=clone(def),node=n.nodes.find(v=>v.id===id);if(node)node.position={x:snap(x),y:snap(y)};return n;}

export function reaches(def:Def,from:string,to:string):boolean{
  const seen=new Set<string>(),stack=[from];
  while(stack.length){const x=stack.pop()!;if(x===to)return true;if(seen.has(x))continue;seen.add(x);for(const e of def.edges)if(e.from===x)stack.push(e.to);}
  return false;
}
export function connect(def:Def,from:string,to:string,branch?:'true'|'false'):Def{
  const a=def.nodes.find(n=>n.id===from),b=def.nodes.find(n=>n.id===to);
  if(!a||!b)throw new Error('Bloco não encontrado.');
  if(from===to)throw new Error('Um bloco não pode se conectar a ele mesmo.');
  if(isTrigger(b.type))throw new Error('O gatilho é o início do fluxo: nada pode levar até ele.');
  if(isCondition(a.type)&&!branch)throw new Error('Escolha o caminho da condição (SIM ou NÃO).');
  const br=isCondition(a.type)?branch:undefined;
  if(def.edges.some(e=>e.from===from&&e.to===to&&e.branch===br))throw new Error('Essa conexão já existe.');
  if(reaches(def,to,from))throw new Error('Essa conexão criaria um ciclo: o fluxo voltaria a um bloco anterior.');
  const n=clone(def);n.edges.push(br?{from,to,branch:br}:{from,to});return n;
}
export function ancestors(def:Def,id:string):string[]{
  const seen=new Set<string>(),stack=def.edges.filter(e=>e.to===id).map(e=>e.from);
  while(stack.length){const x=stack.pop()!;if(seen.has(x))continue;seen.add(x);for(const e of def.edges)if(e.to===x)stack.push(e.from);}
  return def.nodes.filter(n=>seen.has(n.id)).map(n=>n.id);
}
// Variáveis que o bloco pode usar: dados do gatilho e saídas dos blocos que vêm antes dele.
export function variableOptions(def:Def,id:string):{label:string;value:string}[]{
  const out:{label:string;value:string}[]=[];
  const trig=def.nodes.find(n=>n.type==='trigger.manual');
  for(const k of Object.keys((trig?.config.defaults??{}) as object))out.push({label:`Gatilho · ${k}`,value:`{{ trigger.${k} }}`});
  for(const aid of ancestors(def,id)){
    const node=def.nodes.find(n=>n.id===aid)!;
    for(const f of BLOCK_UI[node.type]?.outputs?.(node)??[])out.push({label:`${node.name||node.id} · ${f}`,value:`{{ steps.${aid}.output.${f} }}`});
  }
  return out;
}
// Posição automática em colunas, pela profundidade no fluxo.
export function autoLayout(def:Def):Def{
  const n=clone(def),depth:Record<string,number>=Object.fromEntries(n.nodes.map(x=>[x.id,0]));
  for(let i=0;i<n.nodes.length;i++)for(const e of n.edges)if(depth[e.from]!==undefined&&depth[e.to]!==undefined)depth[e.to]=Math.max(depth[e.to],depth[e.from]+1);
  const rows:Record<number,number>={};
  for(const x of n.nodes){const d=depth[x.id],r=rows[d]??0;rows[d]=r+1;x.position={x:36+d*(NODE_W+60),y:36+r*(NODE_H+40)};}
  return n;
}
export const ensurePositions=(def:Def):Def=>def.nodes.every(n=>n.position)?def:autoLayout(def);
export const sameDef=(a:Def,b:Def)=>JSON.stringify(a)===JSON.stringify(b);

// Portas de conexão: a condição tem duas saídas (SIM em cima, NÃO embaixo).
export function outPort(n:Node,branch?:'true'|'false'){
  const p=n.position??{x:0,y:0};
  return {x:p.x+NODE_W,y:p.y+(isCondition(n.type)?(branch==='false'?NODE_H*0.72:NODE_H*0.28):NODE_H/2)};
}
export const inPort=(n:Node)=>({x:(n.position?.x??0),y:(n.position?.y??0)+NODE_H/2});
// Identifica qual bloco um erro do servidor menciona (para destacar no mapa).
export const errorNodes=(errors:string[]):Set<string>=>new Set(errors.map(e=>/(?:Bloco|bloco|gatilho|condição|conexão)[^"]*"([^"]+)"/.exec(e)?.[1]).filter((x):x is string=>!!x));
