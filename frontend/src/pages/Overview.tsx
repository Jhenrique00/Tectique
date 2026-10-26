import {crmApi} from '../crm-api';
import {useEffect,useState} from 'react';
import {Icon} from '../components/Icon';
import {flowApi,workspaceApi,type Flow,type RunItem,type Routine,type Credential} from '../api';
import {Head,RUN_LABEL,fail,when} from './common';
interface Counts{total:number;ok:number;bad:number}
export function Overview({wid,routines,reportsTotal,go}:{wid:string;routines:Routine[];reportsTotal:number;go:(s:string)=>void}){
  const [contacts,setContacts]=useState<number|null>(null);
  const [flows,setFlows]=useState<Flow[]>([]);const [runs,setRuns]=useState<RunItem[]>([]);const [counts,setCounts]=useState<Counts>({total:0,ok:0,bad:0});
  const [creds,setCreds]=useState<Credential[]|null>(null);const [error,setError]=useState('');
  useEffect(()=>{
    if(!wid)return;let live=true;
    (async()=>{
      try{
        const [f,r,t,o,b,crm]=await Promise.all([flowApi.flows(wid),workspaceApi.runsPage(wid,{limit:8}),workspaceApi.runsPage(wid,{limit:1}),workspaceApi.runsPage(wid,{limit:1,status:'succeeded'}),workspaceApi.runsPage(wid,{limit:1,status:'failed'}),crmApi.summary(wid)]);
        if(!live)return;setContacts(crm.total);setFlows(f.items);setRuns(r.items);setCounts({total:t.total,ok:o.total,bad:b.total});
        workspaceApi.credentials(wid).then(c=>live&&setCreds(c.items)).catch(()=>live&&setCreds(null));
      }catch(e){if(live)setError(fail(e));}
    })();
    return()=>{live=false;};
  },[wid]);
  const scheduled=flows.filter(f=>f.trigger_type==='schedule');
  const activeN=scheduled.filter(f=>f.enabled).length+routines.filter(r=>r.enabled).length;
  const pausedN=scheduled.filter(f=>!f.enabled).length+routines.filter(r=>!r.enabled).length;
  const upcoming=[...scheduled.filter(f=>f.enabled&&f.next_run_at).map(f=>({name:f.name,at:f.next_run_at!})),...routines.filter(r=>r.enabled&&r.next_run_at).map(r=>({name:`Rotina ${r.repository}`,at:r.next_run_at!}))]
    .sort((a,b)=>+new Date(a.at)-+new Date(b.at)).slice(0,5);
  const failed=runs.filter(r=>r.status==='failed').slice(0,3);
  return <section className="dashboard-panel">
    <Head eyebrow="VISÃO GERAL" title="Dashboard">Números reais do seu workspace. Indicadores de módulos ainda não implementados aparecem apagados, sem valores inventados.</Head>
    {error&&<div className="alert error" role="alert">{error}</div>}
    <div className="stat-grid">
      <div className="stat"><small>Automações cadastradas</small><strong>{flows.length+routines.length}</strong><span>{flows.length} fluxo{flows.length===1?'':'s'} · {routines.length} rotina{routines.length===1?'':'s'}</span></div>
      <div className="stat"><small>Ativas / pausadas</small><strong>{activeN} / {pausedN}</strong><span>Somente agendadas (fluxos manuais não contam)</span></div>
      <div className="stat"><small>Execuções de fluxos</small><strong>{counts.total}</strong><span>{counts.ok} concluídas</span></div>
      <div className={'stat'+(counts.bad?' bad':'')}><small>Com falha</small><strong>{counts.bad}</strong><span>{counts.bad?'Veja em Histórico e execuções':'Nenhuma falha registrada'}</span></div>
      <div className="stat"><small>Relatórios salvos</small><strong>{reportsTotal}</strong><span>GitHub Analytics</span></div>
      <div className="stat"><small>Clientes e leads</small><strong>{contacts??'—'}</strong><span>Contatos ativos no workspace</span></div>
      <div className="stat dim"><small>Atendimentos</small><strong>—</strong><span>Atendimento com IA em desenvolvimento</span></div>
      <div className="stat"><small>Serviços conectados</small><strong>{creds?creds.length:'—'}</strong><span>{creds?'Credenciais salvas · GitHub público não exige conexão':'Credenciais visíveis para administradores'}</span></div>
    </div>
    <div className="cols-2">
      <div className="box"><h3>Próximas execuções</h3>
        {upcoming.length===0?<p className="muted-note">Nada agendado. Crie um fluxo agendado ou uma rotina e ative-o. Agendamentos só rodam enquanto o servidor estiver ligado.</p>
          :upcoming.map((u,i)=><div className="rowline" key={i}><span>{u.name}</span><small>{when(u.at)}</small></div>)}
        <button className="link-btn" onClick={()=>go('automations')}>Ir para Automações →</button></div>
      <div className="box"><h3>Alertas</h3>
        {failed.length===0?<p className="muted-note">Sem alertas: nenhuma das últimas execuções falhou.</p>
          :failed.map(r=><div className="rowline" key={r.id}><span><Icon name="triangle-alert"/> {r.flow_name}<br/><small>{r.error}</small></span><small>{when(r.queued_at)}</small></div>)}
        <button className="link-btn" onClick={()=>go('history')}>Ver histórico →</button></div>
    </div>
    <div className="box" style={{marginTop:18}}><h3>Atividades recentes</h3>
      {runs.length===0?<p className="muted-note">Nenhuma execução ainda.</p>:runs.map(r=><div className="rowline" key={r.id}><span>{r.flow_name} <small>· {r.trigger_type==='schedule'?'agendada':r.trigger_type==='retry'?'nova tentativa':'manual'}</small></span><span className={'pill '+(r.status==='succeeded'?'ok':r.status==='failed'?'bad':'warn')}>{RUN_LABEL[r.status]}</span><small>{when(r.queued_at)}</small></div>)}
    </div>
  </section>;
}
