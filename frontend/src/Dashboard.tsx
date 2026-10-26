import {useCallback,useEffect,useState,type FormEvent} from 'react';
import './workspace.css';
import type {Automation} from './data';
import {GitHubAnalytics} from './components/GitHubAnalytics';
import {AuthScreen} from './components/AuthScreen';
import {FlowsPanel} from './components/FlowsPanel';
import {Icon} from './components/Icon';
import {authApi,flowApi,reportApi,routineApi,type Report,type Routine,type SavedReport,type User,type Workspace} from './api';
import {Overview} from './pages/Overview';
import {Builder} from './pages/Builder';
import {Runs} from './pages/Runs';
import {Integrations} from './pages/Integrations';
import {Templates} from './pages/Templates';
import {Settings} from './pages/Settings';
import {Crm} from './pages/Crm';
import {Chat,Admin,Finance} from './pages/Concepts';
import {SubTabs,Head,fail as readableError,when} from './pages/common';

type State='ok'|'part'|'soon';
const NAV:readonly (readonly [string,string,string,State])[]=[
  ['overview','layout-dashboard','Dashboard','ok'],['automations','repeat-2','Automações','ok'],['builder','workflow','Criador de fluxos','ok'],
  ['chat','message-circle','Atendimento com IA','soon'],['crm','users','Clientes e CRM','ok'],['admin','bot','Assistente administrativo','soon'],['finance','wallet','Financeiro','soon'],
  ['integrations','plug','Integrações','part'],['history','history','Histórico e execuções','ok'],['templates','library','Modelos prontos','part'],['settings','settings','Configurações','ok'],
];
type AutoTab='flows'|'routines'|'github';type HistTab='runs'|'reports';
const AUTO_TABS=[['flows','Fluxos'],['routines','Rotinas do GitHub'],['github','GitHub Analytics']] as const;
const HIST_TABS=[['runs','Execuções de fluxos'],['reports','Relatórios salvos']] as const;
function parseHash(){
  const m=/^#\/dashboard\/([a-z]+)(?:\/([a-z0-9-]+))?/.exec(location.hash);
  const id=m&&NAV.some(n=>n[0]===m[1])?m[1]:'overview';return {id,sub:m?.[2]};
}
export function Dashboard({onSelect}:{onSelect:(item:Automation)=>void}){
  const [account,setAccount]=useState<User|null>(null);const [checking,setChecking]=useState(true);
  const [section,setSection]=useState(()=>parseHash().id);const [autoTab,setAutoTab]=useState<AutoTab>('flows');const [histTab,setHistTab]=useState<HistTab>('runs');
  const [history,setHistory]=useState<SavedReport[]>([]);const [total,setTotal]=useState(0);const [offset,setOffset]=useState(0);
  const [routines,setRoutines]=useState<Routine[]>([]);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const [chosen,setChosen]=useState<Report|null>(null);const [chosenKey,setChosenKey]=useState(0);
  const [repository,setRepository]=useState('');const [days,setDays]=useState(30);const [frequency,setFrequency]=useState(24);
  const [workspaces,setWorkspaces]=useState<Workspace[]>([]);const [wid,setWid]=useState('');const [builderFlow,setBuilderFlow]=useState<string|undefined>();
  const go=useCallback((id:string,sub?:string)=>{location.hash=`/dashboard/${id}${sub?'/'+sub:''}`;},[]);
  useEffect(()=>{
    const sync=()=>{const {id,sub}=parseHash();setSection(id);setError('');
      if(id==='automations'&&AUTO_TABS.some(t=>t[0]===sub))setAutoTab(sub as AutoTab);
      if(id==='history'&&HIST_TABS.some(t=>t[0]===sub))setHistTab(sub as HistTab);
      setBuilderFlow(id==='builder'?sub:undefined);};
    addEventListener('hashchange',sync);sync();return()=>removeEventListener('hashchange',sync);
  },[]);
  useEffect(()=>{let active=true;authApi.me().then(r=>{if(active)setAccount(r.user);}).catch(()=>{}).finally(()=>{if(active)setChecking(false);});return()=>{active=false;};},[]);
  const loadWorkspaces=useCallback(async(select?:string)=>{const r=await flowApi.workspaces();setWorkspaces(r.items);setWid(cur=>select&&r.items.some(w=>w.id===select)?select:r.items.some(w=>w.id===cur)?cur:r.items[0]?.id??'');},[]);
  const loadHistory=useCallback(async(page=0)=>{const response=await reportApi.list(page,15);setHistory(response.items);setTotal(response.total);setOffset(page);},[]);
  const loadRoutines=useCallback(async()=>{const response=await routineApi.list();setRoutines(response.items);},[]);
  useEffect(()=>{if(!account)return;void loadWorkspaces().catch(e=>setError(readableError(e)));void loadHistory().catch(e=>setError(readableError(e)));void loadRoutines().catch(e=>setError(readableError(e)));},[account,loadWorkspaces,loadHistory,loadRoutines]);
  useEffect(()=>{if(!account)return;const timer=setInterval(()=>{void loadRoutines().catch(()=>{});},20000);return()=>clearInterval(timer);},[account,loadRoutines]);
  async function logout(){setBusy(true);try{await authApi.logout();setAccount(null);setHistory([]);setRoutines([]);setWorkspaces([]);setWid('');setChosen(null);go('overview');}catch(e){setError(readableError(e));}finally{setBusy(false);}}
  async function chooseReport(id:string){setBusy(true);setError('');try{const report=await reportApi.get(id);setChosen(report);setChosenKey(k=>k+1);go('automations','github');}catch(e){setError(readableError(e));}finally{setBusy(false);}}
  async function createRoutine(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{await routineApi.create(repository.trim(),days,frequency);setRepository('');await loadRoutines();}catch(e){setError(readableError(e));}finally{setBusy(false);}}
  async function changeRoutine(r:Routine,action:'toggle'|'remove'|'run'){
    setBusy(true);setError('');try{
      if(action==='toggle')await routineApi.toggle(r.id,!r.enabled);
      else if(action==='run')await routineApi.run(r.id);
      else if(confirm(`Excluir a rotina de ${r.repository}? Os relatórios já salvos serão mantidos.`))await routineApi.remove(r.id);
      await loadRoutines();
    }catch(e){setError(readableError(e));}finally{setBusy(false);}
  }
  if(checking)return <div className="page-loading"><Icon name="loader"/><p>Carregando Tectique…</p></div>;
  if(!account)return <AuthScreen onAuthenticated={setAccount}/>;
  const role=workspaces.find(w=>w.id===wid)?.role;
  return <div className="workspace">
    <header className="workspace-header">
      <a className="brand" href="#/"><Icon name="zap"/>Tectique<span className="beta">WORKSPACE</span></a>
      <div className="workspace-actions"><span className="account-chip"><span className="account-avatar">{account.name.charAt(0).toUpperCase()}</span><span><strong>{account.name}</strong><small>{account.email}</small></span></span>
        <button className="btn secondary small" disabled={busy} onClick={()=>void logout()}>Sair</button>
      </div>
    </header>
    <div className="workspace-layout">
      <aside className="workspace-sidebar" aria-label="Navegação principal">
        {workspaces.length>1&&<label className="muted-note" style={{padding:'0 6px 8px'}}>Workspace<select value={wid} onChange={e=>setWid(e.target.value)}>{workspaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>}
        {NAV.map(([id,icon,label,state])=><button className={'side-item '+(section===id?'active':'')} key={id} onClick={()=>go(id)} aria-current={section===id?'page':undefined}>
          <Icon name={icon}/>{label}<span className={'dot '+(state==='ok'?'ok':state==='part'?'part':'')} title={state==='ok'?'Em funcionamento':state==='part'?'Parcialmente implementado':'Em desenvolvimento'}/></button>)}
        <div className="legend"><span><i className="ok"/> Em funcionamento</span><span><i className="part"/> Parcial</span><span><i/> Em desenvolvimento</span></div>
        <p className="workspace-note"><Icon name="shield-check"/> Agendamentos só executam enquanto a Tectique estiver aberta.</p>
      </aside>
      <main className={'workspace-content'+(section==='builder'?' wide':'')} id="main">
        {error&&<div className="alert error" role="alert">{error}</div>}
        {section==='overview'&&<Overview wid={wid} routines={routines} reportsTotal={total} go={go}/>}
        {section==='automations'&&<div><p className="eyebrow">AUTOMAÇÕES</p><SubTabs tabs={AUTO_TABS} value={autoTab} onChange={t=>go('automations',t)}/>
          {autoTab==='flows'&&(wid?<FlowsPanel wid={wid} role={role} onEdit={id=>go('builder',id)}/>:<p role="status">Carregando workspace…</p>)}
          {autoTab==='github'&&<GitHubAnalytics key={chosenKey} selectedReport={chosen} onReport={()=>{setChosen(null);void loadHistory(0).catch(e=>setError(readableError(e)));}}/>}
          {autoTab==='routines'&&<section className="dashboard-panel">
            <h2>Rotinas do GitHub</h2><p>Monitore repositórios públicos do GitHub sem refazer cada consulta. Ative, pause ou execute quando quiser.</p>
            <form className="routine-form" onSubmit={e=>void createRoutine(e)}>
              <div className="routine-form-title"><Icon name="calendar-clock"/><strong>Nova rotina</strong></div>
              <div className="routine-fields"><label>Repositório GitHub<input placeholder="usuario/repositorio" value={repository} maxLength={250} required onChange={e=>setRepository(e.target.value)}/></label>
                <label>Período<select value={days} onChange={e=>setDays(Number(e.target.value))}><option value={7}>7 dias</option><option value={30}>30 dias</option><option value={90}>90 dias</option></select></label>
                <label>Frequência<select value={frequency} onChange={e=>setFrequency(Number(e.target.value))}><option value={1}>A cada 1 hora</option><option value={6}>A cada 6 horas</option><option value={12}>A cada 12 horas</option><option value={24}>A cada 24 horas</option></select></label></div>
              <button className="btn primary" disabled={busy} type="submit"><Icon name="repeat-2"/> Criar rotina</button>
              <small>A primeira execução ocorre após o intervalo escolhido. Use “Executar agora” para antecipar. Rotinas só executam enquanto o servidor estiver ligado.</small>
            </form>
            <div className="routines-title"><h3>Suas rotinas</h3><span className="badge">{routines.filter(r=>r.enabled).length} ativas</span><button className="btn secondary small" onClick={()=>void loadRoutines().catch(e=>setError(readableError(e)))}>Atualizar</button></div>
            {routines.length===0?<div className="empty dashboard-empty"><Icon name="calendar-clock"/><h3>Nenhuma rotina criada</h3><p>Adicione seu primeiro repositório acima.</p></div>:
            <div className="routines-list">{routines.map(r=><article className="routine-card" key={r.id}>
              <div className="routine-top"><div><strong><Icon name="github"/> {r.repository}</strong><small>{r.days} dias · A cada {r.interval_hours} hora{r.interval_hours>1?'s':''}</small></div><span className={'routine-status '+(r.enabled?'enabled':'paused')}>{r.enabled?(r.status==='running'?'Executando':r.status==='error'?'Erro anterior':'Ativa'):'Pausada'}</span></div>
              <div className="routine-details"><span>Próxima execução<strong>{when(r.next_run_at)}</strong></span><span>Última execução<strong>{when(r.last_run_at)}</strong></span></div>
              {r.last_error&&<div className="alert warning">Último erro: {r.last_error}</div>}
              <div className="routine-actions"><button className="btn secondary small" disabled={busy} onClick={()=>void changeRoutine(r,'run')}><Icon name="circle-play"/> Executar agora</button><button className="btn secondary small" disabled={busy} onClick={()=>void changeRoutine(r,'toggle')}><Icon name="toggle-right"/>{r.enabled?'Pausar':'Ativar'}</button><button className="btn subtle small" disabled={busy} onClick={()=>void changeRoutine(r,'remove')}>Excluir</button></div>
            </article>)}</div>}
          </section>}
        </div>}
        {section==='builder'&&(wid?<Builder key={wid+(builderFlow??'')} wid={wid} role={role} initialFlow={builderFlow}/>:<p role="status">Carregando workspace…</p>)}
        {section==='chat'&&<Chat/>}{section==='crm'&&wid&&<Crm key={wid} wid={wid} role={role}/>}{section==='admin'&&<Admin/>}{section==='finance'&&<Finance/>}
        {section==='integrations'&&<Integrations wid={wid} role={role}/>}
        {section==='history'&&<div><Head eyebrow="REGISTROS" title="Histórico e execuções">Tudo o que a Tectique executou e salvou na sua conta, com etapas, erros e nova tentativa.</Head>
          <SubTabs tabs={HIST_TABS} value={histTab} onChange={t=>go('history',t)}/>
          {histTab==='runs'&&<Runs wid={wid}/>}
          {histTab==='reports'&&<section>
            <div className="section-head"><div><p>Relatórios do GitHub Analytics gravados no PostgreSQL, mesmo depois de fechar o aplicativo.</p></div><span className="badge">{total} relatório{total===1?'':'s'}</span></div>
            <button className="btn secondary small" onClick={()=>void loadHistory(offset).catch(e=>setError(readableError(e)))}>Atualizar histórico</button>
            {history.length===0?<div className="empty dashboard-empty"><Icon name="list-checks"/><h3>Nenhum relatório salvo ainda</h3><p>Faça uma análise para começar seu histórico.</p><button className="btn primary" onClick={()=>go('automations','github')}>Gerar relatório</button></div>:
            <div className="history-list">{history.map(r=><article className="history-entry" key={r.id}>
              <div className="history-entry-icon"><Icon name="github"/></div><div className="history-entry-body"><strong>{r.repository}</strong><p>{r.summary}</p><small>{r.days} dias · {when(r.saved_at)}</small></div>
              <button className="btn secondary small" disabled={busy} onClick={()=>void chooseReport(r.id)}>Abrir relatório <Icon name="arrow-up-right"/></button>
            </article>)}</div>}
            {total>15&&<div className="pagination"><button className="btn secondary small" disabled={offset===0} onClick={()=>void loadHistory(Math.max(0,offset-15))}>Anterior</button><small>{offset+1}–{Math.min(offset+15,total)} de {total}</small><button className="btn secondary small" disabled={offset+15>=total} onClick={()=>void loadHistory(offset+15)}>Próxima</button></div>}
          </section>}</div>}
        {section==='templates'&&<Templates wid={wid} role={role} go={go} onSelect={onSelect}/>}
        {section==='settings'&&<Settings account={account} workspaces={workspaces} wid={wid} role={role} reload={s=>void loadWorkspaces(s).catch(e=>setError(readableError(e)))}/>}
      </main>
    </div>
  </div>;
}
