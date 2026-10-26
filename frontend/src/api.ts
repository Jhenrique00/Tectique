export interface Activity {id:string;title:string;url:string;author:string;date:string;state:string|null;}
export interface Report {
  repository:string;repository_url:string;description:string|null;default_branch:string;days:number;since:string;generated_at:string;
  commits:Activity[];issues:Activity[];pull_requests:Activity[];partial:boolean;notes:string[];summary:string;
}
export interface User {id:string;name:string;email:string}
export interface SavedReport {id:string;repository:string;days:number;generated_at:string;saved_at:string;summary:string}
export interface Routine {id:string;repository:string;days:number;interval_hours:number;enabled:boolean;status:string;next_run_at:string|null;last_run_at:string|null;last_error:string|null;created_at:string}
const base=(import.meta.env.VITE_API_BASE_URL??'').replace(/\/$/,'');
export async function api<T>(path:string,options:RequestInit={}):Promise<T>{
  const response=await fetch(`${base}/api${path}`,{...options,credentials:'same-origin',headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});
  if(response.status===204)return undefined as T;
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw Object.assign(new Error(typeof data?.detail==='string'?data.detail:'Não foi possível concluir a operação.'),{errors:Array.isArray(data?.errors)?data.errors as string[]:undefined});
  return data as T;
}
export const authApi={
  me:()=>api<{user:User}>('/auth/me'),
  login:(email:string,password:string)=>api<{user:User}>('/auth/login',{method:'POST',body:JSON.stringify({email,password})}),
  register:(name:string,email:string,password:string)=>api<{user:User}>('/auth/register',{method:'POST',body:JSON.stringify({name,email,password})}),
  logout:()=>api<{ok:boolean}>('/auth/logout',{method:'POST'}),
};
export async function fetchReport(repository:string,days:number,signal:AbortSignal):Promise<Report>{
  const data=await api<Report>(`/github/summary?${new URLSearchParams({repository,days:String(days)})}`,{signal});
  if(!data||!Array.isArray(data.commits)||!Array.isArray(data.issues)||!Array.isArray(data.pull_requests))throw new Error('Resposta inesperada do servidor.');
  return data;
}
export const reportApi={
  list:(offset=0,limit=20)=>api<{items:SavedReport[];total:number}>(`/reports?offset=${offset}&limit=${limit}`),
  get:(id:string)=>api<Report>(`/reports/${encodeURIComponent(id)}`),
};
export const routineApi={
  list:()=>api<{items:Routine[]}>('/routines'),
  create:(repository:string,days:number,interval_hours:number)=>api<{routine:Routine}>('/routines',{method:'POST',body:JSON.stringify({repository,days,interval_hours})}),
  run:(id:string)=>api<{routine:Routine}>(`/routines/${encodeURIComponent(id)}/run`,{method:'POST'}),
  toggle:(id:string,enabled:boolean)=>api<{routine:Routine}>(`/routines/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({enabled})}),
  remove:(id:string)=>api<void>(`/routines/${encodeURIComponent(id)}`,{method:'DELETE'}),
};
export type Role='owner'|'admin'|'member'|'viewer';
export interface Workspace {id:string;name:string;role:Role}
export interface Flow {id:string;name:string;description:string;version:number;trigger_type:'manual'|'webhook'|'schedule';schedule_hours:number|null;enabled:boolean;next_run_at:string|null;created_at:string}
export type RunStatus='queued'|'running'|'succeeded'|'failed'|'cancelled';
export interface RunItem {id:string;flow_id:string|null;flow_name:string;trigger_type:'manual'|'webhook'|'schedule'|'retry';status:RunStatus;error:string|null;retry_of:string|null;queued_at:string;started_at:string|null;finished_at:string|null}
export interface RunStep {id:string;node_id:string;node_type:string;status:'running'|'succeeded'|'failed'|'skipped'|'reused';output:any;error:string|null}
const enc=encodeURIComponent;
export const flowApi={
  workspaces:()=>api<{items:Workspace[]}>('/workspaces'),
  flows:(w:string)=>api<{items:Flow[]}>(`/workspaces/${enc(w)}/flows`),
  fromTemplate:(w:string,params:{repository:string;days:number;interval_hours?:number})=>api<{flow:Flow}>(`/workspaces/${enc(w)}/flows/from-template`,{method:'POST',body:JSON.stringify({template:'github-analytics',params})}),
  enable:(w:string,id:string,enabled:boolean)=>api<{flow:Flow}>(`/workspaces/${enc(w)}/flows/${enc(id)}`,{method:'PATCH',body:JSON.stringify({enabled})}),
  remove:(w:string,id:string)=>api<void>(`/workspaces/${enc(w)}/flows/${enc(id)}`,{method:'DELETE'}),
  run:(w:string,id:string)=>api<{run:{id:string}}>(`/workspaces/${enc(w)}/flows/${enc(id)}/run`,{method:'POST',body:JSON.stringify({payload:{}})}),
  runs:(w:string)=>api<{items:RunItem[]}>(`/workspaces/${enc(w)}/runs?limit=20`),
  runDetail:(w:string,id:string)=>api<{run:RunItem;steps:RunStep[]}>(`/workspaces/${enc(w)}/runs/${enc(id)}`),
  retry:(w:string,id:string)=>api<{run:{id:string}}>(`/workspaces/${enc(w)}/runs/${enc(id)}/retry`,{method:'POST'}),
};

export interface BlockInfo {type:string;label:string;description:string;category:'trigger'|'action'|'logic'}
export interface FlowDefinition {nodes:{id:string;type:string;name?:string;config:Record<string,any>;position?:{x:number;y:number}}[];edges:{from:string;to:string;branch?:'true'|'false'}[]}
export interface Credential {id:string;name:string;kind:'api_key'|'token'|'password'|'http'|'smtp';created_at:string}
export interface Member {id:string;name:string;email:string;role:Role;created_at:string}
export interface AuditItem {id:number;action:string;target:string|null;detail:Record<string,unknown>|null;created_at:string;user_name:string|null}
const w=(id:string)=>`/workspaces/${enc(id)}`;
export const workspaceApi={
  blocks:()=>api<{items:BlockInfo[]}>('/blocks'),
  flow:(id:string,fid:string)=>api<{flow:Flow&{definition:FlowDefinition}}>(`${w(id)}/flows/${enc(fid)}`),
  validate:(id:string,definition:FlowDefinition)=>api<{ok:boolean;errors:string[]}>(`${w(id)}/flows/validate`,{method:'POST',body:JSON.stringify({definition})}),
  runsPage:(id:string,o:{status?:string;offset?:number;limit?:number})=>api<{items:RunItem[];total:number;limit:number;offset:number}>(`${w(id)}/runs?${new URLSearchParams({limit:String(o.limit??15),offset:String(o.offset??0),...(o.status?{status:o.status}:{})})}`),
  credentials:(id:string)=>api<{items:Credential[]}>(`${w(id)}/credentials`),
  addCredential:(id:string,name:string,kind:string,secret:string)=>api<{credential:Credential}>(`${w(id)}/credentials`,{method:'POST',body:JSON.stringify({name,kind,secret})}),
  removeCredential:(id:string,cid:string)=>api<void>(`${w(id)}/credentials/${enc(cid)}`,{method:'DELETE'}),
  members:(id:string)=>api<{items:Member[]}>(`${w(id)}/members`),
  addMember:(id:string,email:string,role:Role)=>api<{member:Member}>(`${w(id)}/members`,{method:'POST',body:JSON.stringify({email,role})}),
  setRole:(id:string,uid:string,role:Role)=>api<{ok:boolean}>(`${w(id)}/members/${enc(uid)}`,{method:'PATCH',body:JSON.stringify({role})}),
  removeMember:(id:string,uid:string)=>api<void>(`${w(id)}/members/${enc(uid)}`,{method:'DELETE'}),
  audit:(id:string)=>api<{items:AuditItem[]}>(`${w(id)}/audit`),
  createFlow:(id:string,name:string,definition:FlowDefinition)=>api<{flow:Flow}>(`${w(id)}/flows`,{method:'POST',body:JSON.stringify({name,definition})}),
  updateFlow:(id:string,fid:string,name:string,definition:FlowDefinition)=>api<{flow:Flow}>(`${w(id)}/flows/${enc(fid)}`,{method:'PUT',body:JSON.stringify({name,definition})}),
  createWorkspace:(name:string)=>api<{workspace:Workspace}>('/workspaces',{method:'POST',body:JSON.stringify({name})}),
};
