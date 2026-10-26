import type {ReactNode} from 'react';
import {Icon} from '../components/Icon';
export const when=(v:string|null|undefined)=>v?new Date(v).toLocaleString('pt-BR'):'—';
export const fail=(e:unknown)=>e instanceof Error?e.message:'Não foi possível concluir a operação.';
export const RUN_LABEL:Record<string,string>={queued:'Na fila',running:'Executando',succeeded:'Concluída',failed:'Falhou',cancelled:'Cancelada'};
export const ROLE_LABEL={owner:'Dono',admin:'Administrador',member:'Membro',viewer:'Leitor'} as const;
export function Banner({stage,children}:{stage:number;children?:ReactNode}){
  return <div className="concept" role="note"><Icon name="triangle-alert"/><div><strong>Em desenvolvimento · Etapa {stage}</strong>
    <p>Esta tela mostra o layout planejado. Os dados são <b>exemplos ilustrativos</b> e os botões ainda não executam ações. {children}</p></div></div>;
}
export const Sample=()=><span className="badge sample">Exemplo ilustrativo</span>;
export function Soon({children,icon}:{children:ReactNode;icon?:string}){
  return <button type="button" className="btn secondary small" disabled title="Disponível em breve">{icon&&<Icon name={icon}/>}{children}</button>;
}
export function SubTabs<T extends string>({tabs,value,onChange}:{tabs:readonly (readonly [T,string])[];value:T;onChange:(v:T)=>void}){
  return <div className="subtabs" role="tablist">{tabs.map(([id,label])=><button key={id} role="tab" aria-selected={value===id} className={value===id?'on':''} onClick={()=>onChange(id)}>{label}</button>)}</div>;
}
export function Head({eyebrow,title,children,right}:{eyebrow:string;title:string;children?:ReactNode;right?:ReactNode}){
  return <div className="page-head"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2>{children&&<p>{children}</p>}</div>{right}</div>;
}
