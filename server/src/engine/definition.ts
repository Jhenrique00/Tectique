import {z} from 'zod';
import {getBlock,templateReferences} from './blocks.js';

export const definitionSchema=z.object({
  nodes:z.array(z.object({
    id:z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/,'O identificador do bloco deve começar com letra (até 40 letras, números, _ ou -).'),
    type:z.string().max(64),
    name:z.string().trim().max(80).optional(),
    config:z.record(z.string(),z.any()).default({}),
    position:z.object({x:z.number(),y:z.number()}).optional(),
  })).min(1,'O fluxo precisa ter ao menos um bloco.').max(100,'No máximo 100 blocos por fluxo.'),
  edges:z.array(z.object({from:z.string(),to:z.string(),branch:z.enum(['true','false']).optional()})).max(300,'No máximo 300 conexões por fluxo.'),
});
export type Definition=z.infer<typeof definitionSchema>;
export interface Validation{ok:boolean;errors:string[];definition?:Definition;triggerType?:string;scheduleHours?:number|null}

const getAt=(value:any,path:PropertyKey[])=>path.reduce((cur,key)=>cur==null?undefined:cur[key as any],value);
const hasTemplate=(v:unknown)=>typeof v==='string'&&/\{\{.*\}\}/.test(v);

export function validateDefinition(input:unknown):Validation{
  const parsed=definitionSchema.safeParse(input);
  if(!parsed.success)return {ok:false,errors:parsed.error.issues.map(i=>`${i.path.join('.')||'fluxo'}: ${i.message}`)};
  const def=parsed.data,errors:string[]=[];
  const byId=new Map<string,Definition['nodes'][number]>();
  for(const n of def.nodes){if(byId.has(n.id))errors.push(`Identificador de bloco repetido: "${n.id}".`);byId.set(n.id,n);}
  const triggers=def.nodes.filter(n=>getBlock(n.type)?.category==='trigger');
  for(const n of def.nodes)if(!getBlock(n.type))errors.push(`Bloco "${n.id}": tipo desconhecido "${n.type}".`);
  if(triggers.length!==1)errors.push(triggers.length?'O fluxo deve ter apenas um gatilho.':'O fluxo precisa de um gatilho (manual ou agendamento).');
  const out=new Map<string,string[]>(),inn=new Map<string,string[]>();
  for(const n of def.nodes){out.set(n.id,[]);inn.set(n.id,[]);}
  for(const e of def.edges){
    if(!byId.has(e.from)||!byId.has(e.to)){errors.push(`Conexão inválida: "${e.from}" → "${e.to}".`);continue;}
    if(e.from===e.to){errors.push(`O bloco "${e.from}" não pode se conectar a si mesmo.`);continue;}
    const isCondition=byId.get(e.from)!.type==='logic.condition';
    if(isCondition&&!e.branch)errors.push(`A conexão saindo da condição "${e.from}" precisa indicar "true" ou "false".`);
    if(!isCondition&&e.branch)errors.push(`Só condições podem ter caminho verdadeiro/falso ("${e.from}").`);
    if(getBlock(byId.get(e.to)!.type)?.category==='trigger')errors.push(`O gatilho "${e.to}" não pode receber conexões.`);
    out.get(e.from)!.push(e.to);inn.get(e.to)!.push(e.from);
  }
  // Ciclos (Kahn) e alcance a partir do gatilho.
  const indeg=new Map([...inn].map(([k,v])=>[k,v.length]));
  const queue=def.nodes.filter(n=>indeg.get(n.id)===0).map(n=>n.id),order:string[]=[];
  while(queue.length){const id=queue.shift()!;order.push(id);for(const t of out.get(id)!){indeg.set(t,indeg.get(t)!-1);if(indeg.get(t)===0)queue.push(t);}}
  if(order.length!==def.nodes.length)errors.push('O fluxo tem um ciclo: um bloco volta a um bloco anterior.');
  if(triggers.length===1){
    const reach=new Set<string>([triggers[0].id]),stack=[triggers[0].id];
    while(stack.length){for(const t of out.get(stack.pop()!)!)if(!reach.has(t)){reach.add(t);stack.push(t);}}
    for(const n of def.nodes)if(!reach.has(n.id))errors.push(`O bloco "${n.id}" não é alcançado a partir do gatilho.`);
  }
  const ancestors=(id:string)=>{const seen=new Set<string>(),stack=[...inn.get(id)!];while(stack.length){const x=stack.pop()!;if(!seen.has(x)){seen.add(x);stack.push(...inn.get(x)!);}}return seen;};
  for(const n of def.nodes){
    const block=getBlock(n.type);if(!block)continue;
    const r=block.schema.safeParse(n.config);
    if(!r.success)for(const i of r.error.issues)if(!hasTemplate(getAt(n.config,i.path)))errors.push(`Bloco "${n.id}" — ${i.path.join('.')||'configuração'}: ${i.message}`);
    const up=ancestors(n.id);
    for(const ref of templateReferences(n.config)){
      const [root,second]=ref.split('.');
      if(root==='trigger')continue;
      if(root!=='steps'||!second){errors.push(`Bloco "${n.id}": variável "${ref}" inválida. Use {{ trigger.campo }} ou {{ steps.bloco.output.campo }}.`);continue;}
      if(!up.has(second))errors.push(`Bloco "${n.id}": a variável "${ref}" usa um bloco que não vem antes dele no fluxo.`);
    }
  }
  if(errors.length)return {ok:false,errors};
  const trigger=triggers[0];
  const hours=trigger.type==='trigger.schedule'?Number(trigger.config.interval_hours):null;
  return {ok:true,errors:[],definition:def,triggerType:trigger.type==='trigger.schedule'?'schedule':trigger.type==='trigger.webhook'?'webhook':'manual',scheduleHours:hours&&!Number.isNaN(hours)?hours:null};
}
export function executionOrder(def:Definition):string[]{
  const inn=new Map(def.nodes.map(n=>[n.id,0])),out=new Map<string,string[]>(def.nodes.map(n=>[n.id,[]]));
  for(const e of def.edges){inn.set(e.to,(inn.get(e.to)??0)+1);out.get(e.from)?.push(e.to);}
  const queue=def.nodes.filter(n=>inn.get(n.id)===0).map(n=>n.id),order:string[]=[];
  while(queue.length){const id=queue.shift()!;order.push(id);for(const t of out.get(id)??[]){inn.set(t,inn.get(t)!-1);if(inn.get(t)===0)queue.push(t);}}
  return order;
}

// ---- Modelos prontos: usam exatamente o mesmo motor do criador de fluxos ----
export interface FlowTemplate{
  id:string;name:string;description:string;category:string;
  params:{key:string;label:string;required:boolean;options?:(string|number)[]}[];
  build(params:Record<string,any>):Definition;
}
export const templates:FlowTemplate[]=[{
  id:'github-analytics',name:'GitHub Analytics',category:'Desenvolvimento',
  description:'Gera um relatório de commits, issues e pull requests de um repositório público e salva no histórico.',
  params:[
    {key:'repository',label:'Repositório (usuario/repositorio)',required:true},
    {key:'days',label:'Período em dias',required:true,options:[7,30,90]},
    {key:'interval_hours',label:'Repetir a cada (horas); vazio = somente manual',required:false,options:[1,6,12,24]},
  ],
  build(p){
    const scheduled=p.interval_hours!=null&&p.interval_hours!=='';
    return {
      nodes:[
        scheduled
          ?{id:'gatilho',type:'trigger.schedule',name:'Agendamento',config:{interval_hours:Number(p.interval_hours)}}
          :{id:'gatilho',type:'trigger.manual',name:'Executar manualmente',config:{defaults:{repository:p.repository,days:Number(p.days)}}},
        {id:'relatorio',type:'github.report',name:'GitHub Analytics',config:scheduled
          ?{repository:p.repository,days:Number(p.days)}
          :{repository:'{{ trigger.repository }}',days:'{{ trigger.days }}'}},
      ],
      edges:[{from:'gatilho',to:'relatorio'}],
    };
  },
}];
