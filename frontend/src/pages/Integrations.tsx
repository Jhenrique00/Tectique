import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {Icon} from '../components/Icon';
import {workspaceApi,type Credential,type Role} from '../api';
import {Head,fail,when} from './common';
const CATALOG:[string,string,string,'ok'|'soon',string][]=[
  ['GitHub','gitHub','Consulta de repositórios públicos: commits, issues e pull requests. Não exige conexão.','ok','Disponível'],
  ['WhatsApp Business','message-circle','API oficial ou provedor compatível. Exige conta Meta Business verificada e URL pública com HTTPS.','soon','Planejada · Etapa 5'],
  ['Provedores de IA','bot','Chaves de API de provedores de inteligência artificial, guardadas criptografadas.','soon','Planejada · Etapa 5'],
  ['E-mail SMTP','mail','Envio de texto por SMTP com TLS. Cadastre sua conexão abaixo e use o bloco Enviar e-mail. OAuth e leitura de caixa de entrada ficam para outra etapa.','ok','Disponível'],
  ['Google Calendar','calendar','Agenda de compromissos e horários disponíveis.','soon','Planejada · Próximas integrações'],
  ['Google Sheets','files','Leitura e escrita de planilhas.','soon','Planejada · Próximas integrações'],
  ['Google Drive','files','Arquivos e documentos.','soon','Planejada · Próximas integrações'],
  ['Notion','file-text','Páginas e bancos de dados.','soon','Planejada · Próximas integrações'],
  ['Trello','columns-3','Quadros e cartões.','soon','Planejada · Próximas integrações'],
  ['Slack','message-circle','Notificações e mensagens em canais.','soon','Planejada · Próximas integrações'],
  ['Webhooks e APIs HTTP','plug','Receba JSON autenticado e chame APIs HTTPS nos hosts autorizados pelas conexões.','ok','Disponível'],
  ['Sistemas de pagamento','wallet','Cobranças e conciliação por provedores conectados.','soon','Planejada · Etapa 8'],
  ['CRM e ERP externos','briefcase','Sincronização com sistemas de gestão externos. O CRM interno já está disponível em Clientes e CRM.','soon','Planejada · Próximas integrações'],
];
export function Integrations({wid,role}:{wid:string;role?:Role}){
  const [items,setItems]=useState<Credential[]>([]);const [name,setName]=useState('');const [kind,setKind]=useState('token');const [secret,setSecret]=useState('');
  const [host,setHost]=useState(''),[port,setPort]=useState(465),[user,setUser]=useState(''),[from,setFrom]=useState(''),[header,setHeader]=useState('Authorization');
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const canManage=role==='owner'||role==='admin';
  const load=useCallback(async()=>{if(!wid||!canManage)return;setItems((await workspaceApi.credentials(wid)).items);},[wid,canManage]);
  useEffect(()=>{void load().catch(e=>setError(fail(e)));},[load]);
  async function add(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{const value=kind==='http'?JSON.stringify({host:host.trim(),token:secret||undefined,header}):kind==='smtp'?JSON.stringify({host:host.trim(),port,user,from,password:secret}):secret;await workspaceApi.addCredential(wid,name.trim(),kind,value);setName('');setSecret('');await load();}catch(x){setError(fail(x));}finally{setBusy(false);}}
  async function remove(c:Credential){if(!confirm(`Excluir a credencial “${c.name}”? Fluxos que a usam passarão a falhar.`))return;setBusy(true);try{await workspaceApi.removeCredential(wid,c.id);await load();}catch(x){setError(fail(x));}finally{setBusy(false);}}
  return <section className="dashboard-panel">
    <Head eyebrow="CONEXÕES" title="Integrações">Uma integração só aparece como conectada quando a autenticação for realmente validada. GitHub, HTTP, Webhook e SMTP estão disponíveis. Cadastrar uma conexão não confirma o acesso ao provedor; o resultado aparece ao executar o fluxo.</Head>
    <div className="int-grid">{CATALOG.map(([n,icon,d,s,label])=><article className="int-card" key={n}><header><strong><Icon name={icon==='gitHub'?'github':icon}/> {n}</strong><span className={'badge '+(s==='ok'?'ok':'')}>{label}</span></header><p>{d}</p>
      {s==='ok'?<small className="muted-note">Use os blocos correspondentes no Criador de fluxos.</small>:<button className="btn secondary small" disabled title="Disponível em breve" style={{justifySelf:'start'}}>Conectar</button>}</article>)}</div>
    <div className="box" style={{marginTop:26}}><h3><Icon name="key-round"/> Credenciais do workspace</h3>
      <p className="muted-note">Chaves e tokens ficam criptografados no banco e <b>nunca são exibidos novamente</b>. Os blocos as usam pelo nome e elas são removidas de históricos e logs. Os blocos HTTP e E-mail usam as conexões pelo nome. Apenas o administrador escolhe o servidor autorizado.</p>
      {error&&<div className="alert error" role="alert">{error}</div>}
      {!canManage?<p className="muted-note">Apenas donos e administradores gerenciam credenciais.</p>:<>
        <form className="form-row" onSubmit={e=>void add(e)} style={{margin:'16px 0'}}>
          <label>Nome<input autoComplete="off" required maxLength={60} pattern="[A-Za-z0-9 _.\-]{1,60}" placeholder="ex.: github-pessoal" value={name} onChange={e=>setName(e.target.value)}/></label>
          <label>Tipo<select value={kind} onChange={e=>setKind(e.target.value)}><option value="http">Conexão HTTP</option><option value="smtp">Conexão SMTP</option><option value="token">Token</option><option value="api_key">Chave de API</option><option value="password">Senha</option></select></label>
          {(kind==='http'||kind==='smtp')&&<label>Servidor autorizado<input required placeholder={kind==='http'?'api.exemplo.com':'smtp.exemplo.com'} value={host} onChange={e=>setHost(e.target.value)}/></label>}
          {kind==='http'&&<label>Autenticação<select value={header} onChange={e=>setHeader(e.target.value)}><option value="Authorization">Bearer token (opcional)</option><option value="X-API-Key">X-API-Key (opcional)</option></select></label>}
          {kind==='smtp'&&<><label>Porta TLS<select value={port} onChange={e=>setPort(Number(e.target.value))}><option value={465}>465 — TLS</option><option value={587}>587 — STARTTLS</option></select></label><label>Usuário SMTP<input required value={user} onChange={e=>setUser(e.target.value)}/></label><label>E-mail remetente<input required type="email" value={from} onChange={e=>setFrom(e.target.value)}/></label></>}
          <label>{kind==='smtp'?'Senha SMTP / senha de aplicativo':kind==='http'?'Token (deixe vazio para API pública)':'Segredo'}<input required={kind!=='http'} type="password" autoComplete="off" maxLength={4096} value={secret} onChange={e=>setSecret(e.target.value)}/></label>
          <button className="btn primary small" disabled={busy} type="submit"><Icon name="plus"/> Salvar</button></form>
        {items.length===0?<p className="muted-note">Nenhuma credencial salva.</p>:items.map(c=><div className="rowline" key={c.id}><span><Icon name="lock"/> {c.name} <small>· {({token:'token',api_key:'chave de API',password:'senha',http:'HTTP',smtp:'SMTP'})[c.kind]} · criada em {when(c.created_at)}</small></span><button className="btn subtle small" disabled={busy} onClick={()=>void remove(c)}>Excluir</button></div>)}</>}
    </div>
  </section>;
}
