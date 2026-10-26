import {useCallback,useEffect,useState} from 'react';
import {flowApi,workspaceApi,type RunItem,type RunStep} from '../api';
import {RUN_LABEL,fail,when} from './common';
const STEP:Record<string,string>={running:'Executando',succeeded:'Concluída',failed:'Falhou',skipped:'Ignorada',reused:'Reaproveitada'};
const BLOCK:Record<string,string>={'crm.contact':'Cadastrar ou atualizar contato','trigger.webhook':'Webhook','http.request':'Requisição HTTP','email.send':'Enviar e-mail','trigger.manual':'Gatilho manual','trigger.schedule':'Agendamento','github.report':'GitHub Analytics','logic.condition':'Condição','logic.set':'Variáveis'};
const PAGE=15;
export function Runs({wid}:{wid:string}){
  const [items,setItems]=useState<RunItem[]>([]);const [total,setTotal]=useState(0);const [offset,setOffset]=useState(0);const [status,setStatus]=useState('');
  const [open,setOpen]=useState<string|null>(null);const [steps,setSteps]=useState<RunStep[]>([]);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const load=useCallback(async()=>{if(!wid)return;const r=await workspaceApi.runsPage(wid,{status:status||undefined,offset,limit:PAGE});setItems(r.items);setTotal(r.total);},[wid,status,offset]);
  useEffect(()=>{void load().catch(e=>setError(fail(e)));},[load]);
  async function details(id:string){if(open===id){setOpen(null);return;}setOpen(id);setSteps([]);try{setSteps((await flowApi.runDetail(wid,id)).steps);}catch(e){setError(fail(e));}}
  async function retry(id:string){setBusy(true);try{await flowApi.retry(wid,id);setOffset(0);await load();}catch(e){setError(fail(e));}finally{setBusy(false);}}
  return <div>
    <div className="toolbar"><label>Situação<select value={status} onChange={e=>{setStatus(e.target.value);setOffset(0);}}><option value="">Todas</option>{Object.entries(RUN_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
      <button className="btn secondary small" onClick={()=>void load().catch(e=>setError(fail(e)))}>Atualizar</button><span className="badge">{total} execuç{total===1?'ão':'ões'}</span></div>
    {error&&<div className="alert error" role="alert">{error}</div>}
    {items.length===0?<div className="empty dashboard-empty"><h3>Nenhuma execução encontrada</h3><p>Execute um fluxo em Automações para ver o histórico aqui.</p></div>:
    <div className="history-list">{items.map(r=><article className="history-entry run-entry" key={r.id}><div className="history-entry-body"><strong>{r.flow_name}</strong>
      <small>{r.trigger_type==='webhook'?'Webhook':r.trigger_type==='schedule'?'Agendada':r.trigger_type==='retry'?'Nova tentativa':'Manual'} · início {when(r.started_at??r.queued_at)} · fim {when(r.finished_at)} <span className={'run-status '+r.status}>{RUN_LABEL[r.status]}</span></small>
      {r.error&&<p className="run-error">{r.error}</p>}
      {open===r.id&&<ol className="run-steps">{steps.length===0?<li>Carregando etapas…</li>:steps.map(s=><li key={s.id}><span className={'run-status '+s.status}>{STEP[s.status]}</span> <strong>{BLOCK[s.node_type]??s.node_type}</strong> <small>({s.node_id})</small>{s.error&&<div className="run-error">{s.error}</div>}{s.output?.summary&&<div><small>{String(s.output.summary)}</small></div>}</li>)}</ol>}
      <div className="routine-actions"><button className="btn secondary small" onClick={()=>void details(r.id)}>{open===r.id?'Ocultar etapas':'Ver etapas'}</button>{r.status==='failed'&&<button className="btn secondary small" disabled={busy} onClick={()=>void retry(r.id)}>Tentar novamente</button>}</div></div></article>)}</div>}
    {total>PAGE&&<div className="pagination"><button className="btn secondary small" disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-PAGE))}>Anterior</button><small>{offset+1}–{Math.min(offset+PAGE,total)} de {total}</small><button className="btn secondary small" disabled={offset+PAGE>=total} onClick={()=>setOffset(offset+PAGE)}>Próxima</button></div>}
  </div>;
}
