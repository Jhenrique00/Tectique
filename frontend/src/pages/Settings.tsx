import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {workspaceApi,type AuditItem,type Member,type Role,type User,type Workspace} from '../api';
import {Head,ROLE_LABEL,SubTabs,fail,when} from './common';
const TABS=[['profile','Perfil'],['members','Workspace e membros'],['audit','Auditoria'],['security','Segurança']] as const;
const ACTION:Record<string,string>={'workspace.create':'Workspace criado','member.add':'Membro adicionado','member.role':'Papel alterado','member.remove':'Membro removido','flow.create':'Fluxo criado','flow.update':'Fluxo editado','flow.enable':'Fluxo ativado','flow.pause':'Fluxo pausado','flow.delete':'Fluxo excluído','run.start':'Execução iniciada','run.retry':'Nova tentativa','run.cancel':'Execução cancelada','credential.create':'Credencial criada','credential.delete':'Credencial excluída'};
export function Settings({account,workspaces,wid,role,reload}:{account:User;workspaces:Workspace[];wid:string;role?:Role;reload:(select?:string)=>void}){
  const [tab,setTab]=useState<(typeof TABS)[number][0]>('profile');
  const [members,setMembers]=useState<Member[]>([]);const [audit,setAudit]=useState<AuditItem[]>([]);
  const [email,setEmail]=useState('');const [newRole,setNewRole]=useState<Role>('member');const [wsName,setWsName]=useState('');
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const admin=role==='owner'||role==='admin';
  const loadMembers=useCallback(async()=>{if(wid)setMembers((await workspaceApi.members(wid)).items);},[wid]);
  useEffect(()=>{if(tab==='members')void loadMembers().catch(e=>setError(fail(e)));if(tab==='audit'&&admin)workspaceApi.audit(wid).then(r=>setAudit(r.items)).catch(e=>setError(fail(e)));},[tab,wid,admin,loadMembers]);
  async function act(fn:()=>Promise<unknown>,after?:()=>void){setBusy(true);setError('');try{await fn();after?.();await loadMembers();}catch(e){setError(fail(e));}finally{setBusy(false);}}
  const grant:Role[]=role==='owner'?['viewer','member','admin','owner']:['viewer','member'];
  return <section className="dashboard-panel">
    <Head eyebrow="CONTA E WORKSPACE" title="Configurações"/>
    <SubTabs tabs={TABS} value={tab} onChange={t=>{setTab(t);setError('');}}/>
    {error&&<div className="alert error" role="alert">{error}</div>}
    {tab==='profile'&&<div className="box"><h3>Seu perfil</h3><div className="rowline"><span>Nome</span><strong>{account.name}</strong></div><div className="rowline"><span>E-mail</span><strong>{account.email}</strong></div>
      <p className="muted-note" style={{marginTop:14}}>Edição de perfil, troca de senha e recuperação de acesso ainda estão em desenvolvimento.</p></div>}
    {tab==='members'&&<div style={{display:'grid',gap:18}}>
      <div className="box"><h3>Workspaces</h3>{workspaces.map(w=><div className="rowline" key={w.id}><span>{w.name}{w.id===wid&&<small> · atual</small>}</span><span className="pill">{ROLE_LABEL[w.role]}</span></div>)}
        <form className="form-row" style={{gridTemplateColumns:'2fr auto',marginTop:14}} onSubmit={(e:FormEvent)=>{e.preventDefault();void act(async()=>{const r=await workspaceApi.createWorkspace(wsName.trim());reload(r.workspace.id);},()=>setWsName(''));}}>
          <label>Novo workspace<input required minLength={2} maxLength={70} value={wsName} onChange={e=>setWsName(e.target.value)} placeholder="Nome da empresa ou equipe"/></label><button className="btn secondary small" disabled={busy}>Criar</button></form></div>
      <div className="box"><h3>Membros do workspace atual</h3>
        {members.map(m=><div className="rowline" key={m.id}><span>{m.name}<br/><small>{m.email}</small></span>
          <span style={{display:'flex',gap:8,alignItems:'center'}}>{admin&&m.id!==account.id?<select aria-label={`Papel de ${m.name}`} value={m.role} disabled={busy} onChange={e=>void act(()=>workspaceApi.setRole(wid,m.id,e.target.value as Role))}>{(grant.includes(m.role)?grant:[m.role,...grant]).map(r=><option key={r} value={r} disabled={!grant.includes(r)}>{ROLE_LABEL[r]}</option>)}</select>:<span className="pill">{ROLE_LABEL[m.role]}</span>}
            {(admin||m.id===account.id)&&<button className="btn subtle small" disabled={busy} onClick={()=>{if(confirm(m.id===account.id?'Sair deste workspace?':`Remover ${m.name}?`))void act(()=>workspaceApi.removeMember(wid,m.id),()=>{if(m.id===account.id)reload();});}}>{m.id===account.id?'Sair':'Remover'}</button>}</span></div>)}
        {admin?<form className="form-row" style={{gridTemplateColumns:'2fr 1fr auto',marginTop:14}} onSubmit={(e:FormEvent)=>{e.preventDefault();void act(()=>workspaceApi.addMember(wid,email.trim(),newRole),()=>setEmail(''));}}>
          <label>Adicionar pessoa (já precisa ter conta)<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="pessoa@empresa.com"/></label>
          <label>Papel<select value={newRole} onChange={e=>setNewRole(e.target.value as Role)}>{grant.map(r=><option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></label><button className="btn primary small" disabled={busy}>Adicionar</button></form>
          :<p className="muted-note">Apenas donos e administradores gerenciam membros.</p>}
        <p className="muted-note" style={{marginTop:12}}>Leitor só visualiza · Membro cria e executa fluxos · Administrador gerencia credenciais e membros · Dono concede qualquer papel.</p></div></div>}
    {tab==='audit'&&<div className="box"><h3>Atividades sensíveis (últimas 100)</h3>
      {!admin?<p className="muted-note">Apenas donos e administradores veem a auditoria.</p>:audit.length===0?<p className="muted-note">Nada registrado ainda.</p>:audit.map(a=><div className="rowline" key={a.id}><span>{ACTION[a.action]??a.action}<br/><small>{a.user_name??'—'}{a.detail&&'name' in a.detail?` · ${String(a.detail.name)}`:''}</small></span><small>{when(a.created_at)}</small></div>)}</div>}
    {tab==='security'&&<div className="box"><h3>Como seus dados são protegidos</h3>
      <p className="muted-note">Senhas são guardadas com scrypt e salt individual. A sessão usa cookie HttpOnly e pode ser revogada no servidor. Credenciais de integrações são criptografadas (AES-256-GCM) com uma chave mestra que fica fora do banco, em <code>.local/master.key</code> — faça backup dela junto com a pasta <code>.local</code>. Cada workspace só enxerga os próprios dados.</p>
      <p className="muted-note">Em desenvolvimento: autenticação em dois fatores, recuperação de acesso e sessões ativas.</p></div>}
  </section>;
}
