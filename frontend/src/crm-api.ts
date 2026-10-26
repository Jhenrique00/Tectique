import {api} from './api';
export const STAGES={new:'Novo',contacted:'Contato feito',proposal:'Proposta enviada',negotiation:'Negociação',won:'Fechado',lost:'Perdido'} as const;
export type Stage=keyof typeof STAGES;
export interface Contact{id:string;name:string;email:string|null;phone:string;company:string;source:string;stage:Stage;archived:boolean;version:number;created_at:string;updated_at:string}
export interface Draft{name:string;email:string;phone:string;company:string;source:string;stage:Stage}
export interface Task{id:string;contact_id:string;contact_name:string;title:string;due_at:string|null;completed:boolean;version:number}
export interface Activity{id:number;body:string;kind:string;user_name:string|null;created_at:string}
export interface Summary{total:number;archived:number;won:number;pending:number;overdue:number}
const base=(wid:string)=>`/workspaces/${encodeURIComponent(wid)}/crm`;
const json=(method:string,body:unknown)=>({method,body:JSON.stringify(body)});
export const crmApi={
  summary:(w:string)=>api<Summary>(base(w)+'/summary'),
  contacts:(w:string,q:string,stage:string,archived:boolean,offset:number)=>api<{items:Contact[];total:number}>(base(w)+'/contacts?'+new URLSearchParams({q,...(stage?{stage}:{}),archived:String(archived),offset:String(offset),limit:'30'})),
  get:(w:string,id:string)=>api<{contact:Contact}>(base(w)+'/contacts/'+id),
  create:(w:string,d:Draft)=>api<{contact:Contact}>(base(w)+'/contacts',json('POST',d)),
  update:(w:string,c:Contact,d:Partial<Draft>&{archived?:boolean})=>api<{contact:Contact}>(base(w)+'/contacts/'+c.id,json('PATCH',{...d,version:c.version})),
  activity:(w:string,id:string,offset=0)=>api<{items:Activity[];total:number}>(base(w)+`/contacts/${id}/activity?limit=30&offset=${offset}`),
  note:(w:string,id:string,body:string)=>api(base(w)+`/contacts/${id}/notes`,json('POST',{body})),
  tasks:(w:string,completed:string,offset=0)=>api<{items:Task[];total:number}>(base(w)+'/tasks?'+new URLSearchParams({completed,offset:String(offset),limit:'30'})),
  addTask:(w:string,id:string,title:string,due_at:string|null)=>api(base(w)+`/contacts/${id}/tasks`,json('POST',{title,due_at})),
  complete:(w:string,t:Task)=>api(base(w)+'/tasks/'+t.id,json('PATCH',{completed:!t.completed,version:t.version})),
};
