import {useState} from 'react';
import {Icon} from '../components/Icon';
import {Banner,Head,Sample,Soon,SubTabs} from './common';

export function Chat(){
  const [tab,setTab]=useState<'inbox'|'kb'|'rules'|'perf'>('inbox');
  return <section className="dashboard-panel">
    <Head eyebrow="ATENDIMENTO" title="Atendimento com IA" right={<Sample/>}>Caixa de entrada centralizada com respostas automáticas por IA e transferência para atendentes.</Head>
    <Banner stage={5}>Exige canal do WhatsApp Business autorizado e um provedor de IA conectado. Nenhuma mensagem real é enviada ou recebida hoje.</Banner>
    <SubTabs tabs={[['inbox','Caixa de entrada'],['kb','Base de conhecimento'],['rules','Regras e personalidade'],['perf','Desempenho']] as const} value={tab} onChange={setTab}/>
    {tab==='inbox'&&<div className="inbox">
      <div><strong>Conversas</strong>
        {[['Maria Souza','Quer saber o horário de sexta','IA respondendo','on'],['João Lima','Pediu orçamento de revisão','Aguardando atendente',''],['Ana Paula','Confirmou o agendamento','Concluída',''],['Carlos Mendes','Dúvida sobre preço','IA respondendo','']].map(([n,m,s,o])=><div className={'conv '+o} key={n}><strong>{n}</strong><span>{m}</span><small>{s}</small></div>)}</div>
      <div style={{minHeight:380}}><small className="muted-note">Conversa de exemplo</small>
        <div className="bubble in">Oi! Vocês têm horário livre na sexta de manhã?<small>Cliente · 09:12</small></div>
        <div className="bubble out">Olá, Maria! Na sexta temos 09:00, 10:30 e 11:00. Qual prefere?<small>IA · 09:12</small></div>
        <div className="bubble in">Pode ser 10:30.<small>Cliente · 09:13</small></div>
        <div className="bubble out">Agendado para sexta às 10:30. Enviarei um lembrete antes. ✔<small>IA · 09:13</small></div>
        <div className="composer"><input disabled placeholder="Responder como atendente…" aria-label="Mensagem"/><Soon icon="send">Enviar</Soon></div></div>
      <div><strong>Contato</strong><div className="rowline"><span>Tipo</span><span className="pill ok">Cliente recorrente</span></div><div className="rowline"><span>Etiqueta</span><span className="pill">Agendamento</span></div><div className="rowline"><span>Prioridade</span><span className="pill warn">Média</span></div>
        <div className="rowline"><span>Atendimento automático</span><span className="pill">Ativo</span></div><Soon icon="users">Transferir para humano</Soon><Soon icon="timer">Pausar IA</Soon></div></div>}
    {tab==='kb'&&<div className="cols-2"><div className="box"><h3>Informações da empresa</h3><p className="muted-note">Produtos, serviços, preços, horários e perguntas frequentes que a IA poderá consultar.</p>
        {['Horário de funcionamento','Serviços e preços','Perguntas frequentes','Política de cancelamento'].map(x=><div className="rowline" key={x}><span><Icon name="file-text"/> {x}</span><span className="pill">vazio</span></div>)}<Soon icon="plus">Adicionar documento</Soon></div>
      <div className="drop"><Icon name="upload"/><strong>Enviar arquivos de conhecimento</strong>PDF, planilhas ou texto<Soon icon="upload">Selecionar arquivos</Soon></div></div>}
    {tab==='rules'&&<div className="cols-2"><div className="box"><h3>Personalidade da IA</h3><label>Nome do assistente<input disabled placeholder="Ex.: Assistente da Oficina"/></label><label>Instruções<textarea disabled rows={5} placeholder="Tom de voz, o que pode e o que não pode prometer…"/></label></div>
      <div className="box"><h3>Quando a IA responde</h3>{['Responder automaticamente fora do horário comercial','Transferir quando o cliente pedir um atendente','Transferir quando houver reclamação','Nunca informar preços não cadastrados'].map(x=><div className="rowline" key={x}><span>{x}</span><span className="pill">desativado</span></div>)}</div></div>}
    {tab==='perf'&&<div className="stat-grid">{['Tempo médio de resposta','Conversas atendidas','Resolvidas pela IA','Transferidas'].map(x=><div className="stat dim" key={x}><small>{x}</small><strong>—</strong><span>Sem dados: módulo em desenvolvimento</span></div>)}</div>}
  </section>;
}

export function Admin(){
  const tools:[string,string,string][]=[['Transcrever reunião','mic','Envie áudio ou vídeo e receba o texto completo.'],['Resumo e tarefas','list-checks','Assuntos, decisões e tarefas extraídos da transcrição.'],['Classificar e-mails','mail','Organiza a caixa de entrada e sugere respostas profissionais.'],['Ler documentos','file-text','Extrai informações de PDFs e planilhas.'],['Organizar arquivos','files','Categoriza e renomeia arquivos automaticamente.'],['Compromissos','calendar','Cria eventos e tarefas a partir do que foi decidido.']];
  return <section className="dashboard-panel">
    <Head eyebrow="PRODUTIVIDADE" title="Assistente administrativo" right={<Sample/>}>Automatize reuniões, e-mails, documentos e compromissos com inteligência artificial.</Head>
    <Banner stage={7}>Exige um provedor de IA conectado e permissões nos serviços de e-mail e calendário. Nada é processado hoje.</Banner>
    <div className="int-grid">{tools.map(([n,i,d])=><div className="tool-card" key={n}><Icon name={i}/><strong>{n}</strong><p>{d}</p><Soon>Em breve</Soon></div>)}</div>
    <div className="cols-2" style={{marginTop:20}}><div className="drop"><Icon name="upload"/><strong>Enviar gravação de reunião</strong>MP3, MP4, WAV · até o limite do plano<Soon icon="upload">Selecionar arquivo</Soon></div>
      <div className="box"><h3>Resultado de exemplo <Sample/></h3><p className="muted-note"><b>Resumo:</b> reunião de alinhamento do trimestre.</p><div className="rowline"><span>Decisão</span><small>Priorizar o atendimento por WhatsApp</small></div><div className="rowline"><span>Tarefa</span><small>Enviar proposta até sexta</small></div><Soon icon="send">Enviar tarefas ao gerenciador</Soon></div></div>
  </section>;
}

export function Finance(){
  const [tab,setTab]=useState<'receive'|'pay'|'charges'>('receive');
  const rows:Record<string,string[][]>={receive:[['Maria Souza','Revisão completa','10/11','Pendente'],['João Lima','Freios','05/11','Vencida']],pay:[['Distribuidora ABC','Peças','12/11','Pendente'],['Aluguel','Mensal','05/11','Paga']],charges:[['Cobrança #001','Maria Souza','10/11','Aguardando envio']]};
  return <section className="dashboard-panel">
    <Head eyebrow="FINANÇAS" title="Financeiro" right={<Sample/>}>Contas a pagar e receber, cobranças, conciliação e relatórios.</Head>
    <Banner stage={8}>Operações financeiras e fiscais exigirão permissões, confirmação e auditoria, além de provedores de pagamento e emissão conectados. Nenhum valor abaixo é real.</Banner>
    <div className="stat-grid">{['A receber','A pagar','Vencidos','Saldo previsto'].map(x=><div className="stat dim" key={x}><small>{x}</small><strong>—</strong><span>Sem dados</span></div>)}</div>
    <div className="toolbar"><Soon icon="plus">Novo lançamento</Soon><Soon icon="receipt">Emitir cobrança</Soon><Soon icon="upload">Ler fatura</Soon></div>
    <SubTabs tabs={[['receive','Contas a receber'],['pay','Contas a pagar'],['charges','Cobranças']] as const} value={tab} onChange={setTab}/>
    <div className="box"><table className="tbl"><thead><tr><th>Cliente / fornecedor</th><th>Descrição</th><th>Vencimento</th><th>Situação</th></tr></thead><tbody>{rows[tab].map(r=><tr key={r[0]}>{r.map((c,i)=><td key={i}>{i===3?<span className={'pill '+(c==='Vencida'?'bad':c==='Paga'?'ok':'warn')}>{c}</span>:c}</td>)}</tr>)}</tbody></table></div>
  </section>;
}
