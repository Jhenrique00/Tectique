import {useState} from 'react';
import {workspaceApi,type Role} from '../api';
import {Icon} from '../components/Icon';
import {automations,type Automation} from '../data';
import {Head,fail} from './common';
const LIB:[string,string,string,number|null][]=[
  ['GitHub Analytics','github','Relatórios de commits, issues e pull requests de repositórios públicos.',null],
  ['Atendimento automático pelo WhatsApp','message-circle','Responde clientes 24 horas com IA e a base de conhecimento da empresa.',5],
  ['Agendamento de clientes','calendar','Oferece horários, confirma e registra o compromisso na agenda.',6],
  ['Captura e qualificação de leads','users','Registra contatos de formulários e canais e classifica o interesse.',4],
  ['Recuperação de oportunidades comerciais','repeat-2','Retoma contatos parados no funil com mensagens de acompanhamento.',6],
  ['Avisos de pagamentos pendentes','wallet','Lembretes de vencimento e cobranças atrasadas.',8],
  ['Lembretes de consultas','bell','Avisos e confirmações antes do atendimento.',6],
  ['Resumo de reuniões','mic','Transcreve gravações, resume e extrai decisões e tarefas.',7],
  ['Organização de documentos','files','Lê, categoriza e organiza arquivos.',7],
  ['Classificação de e-mails','mail','Separa e sugere respostas para e-mails recebidos.',7],
  ['Atualização automática de CRM','briefcase','Mantém clientes e oportunidades atualizados a partir das conversas.',4],
  ['Notificações de novos pedidos','bell','Avisa a equipe quando um pedido chega.',3],
  ['Relatórios de desempenho','chart-no-axes-combined','Indicadores de atendimento, vendas e produtividade.',9],
];
export function Templates({go,onSelect,wid,role}:{wid:string;role?:Role;go:(s:string,sub?:string)=>void;onSelect:(a:Automation)=>void}){
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const allowed=role==='owner'||role==='admin'||role==='member';
  async function capture(){setBusy(true);setError('');try{const {flow}=await workspaceApi.createFlow(wid,'Captura de clientes por webhook',{nodes:[{id:'entrada',type:'trigger.webhook',name:'Formulário recebido',config:{},position:{x:36,y:36}},{id:'cliente',type:'crm.contact',name:'Salvar cliente no CRM',config:{name:'{{ trigger.name }}',email:'{{ trigger.email }}',source:'Formulário via webhook'},position:{x:296,y:36}}],edges:[{from:'entrada',to:'cliente'}]});go('builder',flow.id);}catch(e){setError(fail(e));}finally{setBusy(false);}}
  return <section className="dashboard-panel">
    <Head eyebrow="BIBLIOTECA" title="Modelos prontos">Automações que você ativa sem programar e depois pode abrir no criador de fluxos. Cada uma mostra com clareza se já funciona.</Head>
    {error&&<div className="alert error" role="alert">{error}</div>}
    <article className="int-card" style={{marginTop:22}}><header><strong>Captura de clientes por webhook</strong><span className="badge ok">Disponível</span></header><p>Recebe nome e e-mail, cadastra ou atualiza o contato no CRM e preserva sua etapa comercial. Depois de criar, um administrador deve ativar o webhook.</p><button className="btn primary small" disabled={!wid||!allowed||busy} onClick={()=>void capture()}>Criar fluxo de captura</button></article>
    <div className="int-grid" style={{marginTop:22}}>{LIB.map(([n,icon,d,stage])=><article className="int-card" key={n}>
      <header><strong><Icon name={icon}/> {n}</strong><span className={'badge '+(stage===null?'ok':'')}>{stage===null?'Disponível':`Etapa ${stage}`}</span></header><p>{d}</p>
      {stage===null?<div className="routine-actions"><button className="btn primary small" onClick={()=>go('automations','flows')}>Criar fluxo</button><button className="btn secondary small" onClick={()=>go('automations','github')}>Abrir ferramenta</button></div>
        :<div style={{display:'flex',gap:8,alignItems:'center'}}><button className="btn secondary small" disabled title="Disponível em breve">Ativar</button><small className="muted-note">Em desenvolvimento</small></div>}
    </article>)}</div>
    <p className="eyebrow" style={{marginTop:34}}>DEMONSTRAÇÕES DE INTERFACE</p>
    <p className="muted-note">Prévias visuais sem ações externas, mantidas do catálogo anterior.</p>
    <div className="int-grid">{automations.filter(a=>a.id!=='github').map(a=><article className="int-card" key={a.id}><header><strong><Icon name={a.icon}/> {a.name}</strong><span className="badge sample">Demonstração</span></header><p>{a.description}</p>
      <button className="link-btn" onClick={()=>onSelect(a)} style={{justifySelf:'start'}}>Ver demonstração →</button></article>)}</div>
  </section>;
}
