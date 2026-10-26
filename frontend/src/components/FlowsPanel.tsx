import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {Icon} from './Icon';
import {flowApi,type Flow,type RunItem,type RunStep,type Role} from '../api';
const when=(v:string|null)=>v?new Date(v).toLocaleString('pt-BR'):'—';
const fail=(e:unknown)=>e instanceof Error?e.message:'Não foi possível concluir a operação.';
const RUN_LABEL:Record<string,string>={queued:'Na fila',running:'Executando',succeeded:'Concluída',failed:'Falhou',cancelled:'Cancelada'};
const STEP_LABEL:Record<string,string>={running:'Executando',succeeded:'Concluída',failed:'Falhou',skipped:'Ignorada',reused:'Reaproveitada'};
const BLOCK_LABEL:Record<string,string>={'crm.contact':'Cadastrar ou atualizar contato','trigger.webhook':'Webhook','http.request':'Requisição HTTP','email.send':'Enviar e-mail','trigger.manual':'Gatilho manual','trigger.schedule':'Agendamento','github.report':'GitHub Analytics','logic.condition':'Condição','logic.set':'Variáveis'};
const TRIGGER_LABEL={manual:'Manual',webhook:'Webhook',schedule:'Agendada',retry:'Nova tentativa'} as const;
export function FlowsPanel({wid,role,onEdit}:{wid:string;role?:Role;onEdit?:(id:string)=>void}){
  const [flows,setFlows]=useState<Flow[]>([]);const [runs,setRuns]=useState<RunItem[]>([]);
  const [open,setOpen]=useState<string|null>(null);const [steps,setSteps]=useState<RunStep[]>([]);
  const [repository,setRepository]=useState('');const [days,setDays]=useState(30);const [every,setEvery]=useState(0);
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const refresh=useCallback(async()=>{
    if(!wid)return;
    const [f,r]=await Promise.all([flowApi.flows(wid),flowApi.runs(wid)]);setFlows(f.items);setRuns(r.items);
    if(open)setSteps((await flowApi.runDetail(wid,open)).steps);
  },[wid,open]);
  const active=runs.some(r=>r.status==='queued'||r.status==='running');
  useEffect(()=>{void refresh().catch(e=>setError(fail(e)));const t=setInterval(()=>{void refresh().catch(()=>{});},active?2000:15000);return()=>clearInterval(t);},[refresh,active]);
  async function act(fn:()=>Promise<unknown>){setBusy(true);setError('');try{await fn();await refresh();}catch(e){setError(fail(e));}finally{setBusy(false);}}
  function create(e:FormEvent){e.preventDefault();void act(async()=>{await flowApi.fromTemplate(wid,{repository:repository.trim(),days,...(every?{interval_hours:every}:{})});setRepository('');});}
  async function toggleDetails(id:string){if(open===id){setOpen(null);return;}setOpen(id);setSteps([]);try{setSteps((await flowApi.runDetail(wid,id)).steps);}catch(e){setError(fail(e));}}
  return <section className="dashboard-panel">
    <p className="eyebrow">MOTOR DE EXECUÇÃO</p><h2>Fluxos e execuções</h2>
    <p>Cada fluxo é uma sequência de blocos executada pelo servidor, com registro de cada etapa. É o mesmo motor que o criador visual de fluxos usará.</p>
    {role&&<small>Seu papel neste workspace: <strong>{({owner:'dono',admin:'administrador',member:'membro',viewer:'leitor'})[role]}</strong></small>}
    {error&&<div className="alert error" role="alert">{error}</div>}
    <form className="routine-form" onSubmit={create}>
      <div className="routine-form-title"><Icon name="workflow"/><strong>Novo fluxo — modelo GitHub Analytics</strong></div>
      <div className="routine-fields"><label>Repositório GitHub<input placeholder="usuario/repositorio" value={repository} maxLength={250} required onChange={e=>setRepository(e.target.value)}/></label>
        <label>Período<select value={days} onChange={e=>setDays(Number(e.target.value))}><option value={7}>7 dias</option><option value={30}>30 dias</option><option value={90}>90 dias</option></select></label>
        <label>Execução<select value={every} onChange={e=>setEvery(Number(e.target.value))}><option value={0}>Somente manual</option><option value={1}>A cada 1 hora</option><option value={6}>A cada 6 horas</option><option value={12}>A cada 12 horas</option><option value={24}>A cada 24 horas</option></select></label></div>
      <button className="btn primary" disabled={busy||!wid} type="submit"><Icon name="repeat-2"/> Criar fluxo</button>
      <small>Fluxos agendados começam pausados: ative-os depois de testar com “Executar agora”. Execuções automáticas só ocorrem enquanto o servidor estiver ligado.</small>
    </form>
    <div className="routines-title"><h3>Seus fluxos</h3><span className="badge">{flows.length}</span></div>
    {flows.length===0?<div className="empty dashboard-empty"><Icon name="workflow"/><h3>Nenhum fluxo criado</h3><p>Crie o primeiro acima.</p></div>:
    <div className="routines-list">{flows.map(f=><article className="routine-card" key={f.id}>
      <div className="routine-top"><div><strong><Icon name="workflow"/> {f.name}</strong><small>{f.trigger_type==='schedule'?`Agendado · a cada ${f.schedule_hours} h`:f.trigger_type==='webhook'?'Webhook':'Execução manual'} · versão {f.version}</small></div>
        {f.trigger_type!=='manual'&&<span className={'routine-status '+(f.enabled?'enabled':'paused')}>{f.enabled?'Ativo':'Pausado'}</span>}</div>
      {f.trigger_type==='schedule'&&<div className="routine-details"><span>Próxima execução<strong>{when(f.next_run_at)}</strong></span><span>Estado<strong>{f.enabled?'Ativo':'Pausado'}</strong></span></div>}
      <div className="routine-actions"><button className="btn secondary small" disabled={busy} onClick={()=>void act(()=>flowApi.run(wid,f.id))}><Icon name="circle-play"/> Executar agora</button>
        {f.trigger_type!=='manual'&&<button className="btn secondary small" disabled={busy} onClick={()=>void act(()=>flowApi.enable(wid,f.id,!f.enabled))}><Icon name="toggle-right"/>{f.enabled?'Pausar':'Ativar'}</button>}
        {onEdit&&<button className="btn secondary small" onClick={()=>onEdit(f.id)}><Icon name="workflow"/> Editar no criador</button>}
        <button className="btn subtle small" disabled={busy} onClick={()=>{if(confirm(`Excluir o fluxo “${f.name}”? O histórico das execuções será mantido.`))void act(()=>flowApi.remove(wid,f.id));}}>Excluir</button></div>
    </article>)}</div>}
    <div className="routines-title"><h3>Execuções recentes</h3><span className="badge">{runs.length}</span>{active&&<span className="badge">atualizando…</span>}</div>
    {runs.length===0?<div className="empty dashboard-empty"><p>Nenhuma execução ainda.</p></div>:
    <div className="history-list">{runs.map(r=><article className="history-entry run-entry" key={r.id}>
      <div className="history-entry-body"><strong>{r.flow_name}</strong>
        <small>{TRIGGER_LABEL[r.trigger_type]} · {when(r.queued_at)} <span className={'run-status '+r.status}>{RUN_LABEL[r.status]}</span></small>
        {r.error&&<p className="run-error">{r.error}</p>}
        {open===r.id&&<ol className="run-steps">{steps.length===0?<li>Carregando etapas…</li>:steps.map(s=><li key={s.id}><span className={'run-status '+s.status}>{STEP_LABEL[s.status]}</span> <strong>{BLOCK_LABEL[s.node_type]??s.node_type}</strong> <small>({s.node_id})</small>
          {s.error&&<div className="run-error">{s.error}</div>}{s.output?.summary&&<div><small>{String(s.output.summary)}</small></div>}</li>)}</ol>}
        <div className="routine-actions"><button className="btn secondary small" onClick={()=>void toggleDetails(r.id)}>{open===r.id?'Ocultar etapas':'Ver etapas'}</button>
          {r.status==='failed'&&<button className="btn secondary small" disabled={busy} onClick={()=>void act(()=>flowApi.retry(wid,r.id))}>Tentar novamente</button>}</div>
      </div></article>)}</div>}
  </section>;
}
