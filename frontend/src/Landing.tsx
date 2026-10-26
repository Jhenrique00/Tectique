import { Icon } from "./components/Icon";
import { Catalog, FAQ, Header } from "./components/LandingParts";
import type { Automation } from "./data";
export function Landing({
  onDashboard,
  onSelect,
}: {
  onDashboard: () => void;
  onSelect: (item: Automation) => void;
}) {
  return (
    <div
      onClick={(e) => {
        const el = (e.target as HTMLElement).closest("[data-demo],[data-docs]");
        if (el) onDashboard();
      }}
    >
      <a className="skip" href="#main">
        {"Pular para conteúdo"}
      </a>
      <Header onDashboard={onDashboard} />
      <main id="main">
        <section className="hero wrap">
          <div className="aurora" aria-hidden="true">
            <div></div>
            <div></div>
            <div></div>
          </div>
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="dot"></span>
              {" PLATAFORMA DE AUTOMAÇÕES ONLINE"}
            </p>
            <h1>
              {"Seu trabalho flui."}
              <br />
              <span>{"No automático."}</span>
            </h1>
            <p className="lead">
              {
                "Automatize tarefas repetitivas, acompanhe informações importantes e conecte serviços em um único lugar. Você configura. A Tectique executa."
              }
            </p>
            <div className="actions">
              <a className="btn primary" href="#automacoes">
                {"Explorar automações "}
                <Icon name="arrow-right" className="" />
              </a>
              <a className="btn secondary" href="#como-funciona">
                <Icon name="circle-play" className="" />
                {" Ver como funciona"}
              </a>
            </div>
            <p className="micro">
              <Icon name="sparkles" className="" />
              {" Uma nova forma de fazer seu tempo render."}
            </p>
          </div>
          <div className="flow-art">
            <div className="flow-heading">
              <span>
                <span className="dot"></span>
                {" SUA PRÓXIMA ROTINA"}
              </span>
              <span className="mono">{"01 / 03"}</span>
            </div>
            <div className="flow-card">
              <div className="app-icon orange">
                <Icon name="timer" className="" />
              </div>
              <div>
                <small>{"GATILHO"}</small>
                <strong>{"Todo dia, às 09:00"}</strong>
                <p>{"Uma rotina começa aqui"}</p>
              </div>
              <Icon name="check" className="check" />
            </div>
            <div className="connector">
              <span>{"+"}</span>
            </div>
            <div className="flow-card offset">
              <div className="app-icon purple">
                <Icon name="git-pull-request" className="" />
              </div>
              <div>
                <small>{"PROCESSAMENTO"}</small>
                <strong>{"Consultar seu repositório"}</strong>
                <p>{"Commits, issues e pull requests"}</p>
              </div>
            </div>
            <div className="connector">
              <span>{"+"}</span>
            </div>
            <div className="flow-card">
              <div className="app-icon green">
                <Icon name="chart-no-axes-combined" className="" />
              </div>
              <div>
                <small>{"RESULTADO"}</small>
                <strong>{"Seu resumo, organizado"}</strong>
                <p>{"Informações prontas para você"}</p>
              </div>
              <Icon name="check" className="check" />
            </div>
            <div className="flow-footer">
              <span className="dot"></span>
              {" Fluxo ilustrativo · agendamento disponível no GitHub Analytics "}
              <span>{"↗"}</span>
            </div>
          </div>
          <div className="hero-bottom">
            <span>{"MENOS REPETIÇÃO. MAIS POSSIBILIDADES."}</span>
            <a href="#produto">
              {"Conheça a Tectique "}
              <Icon name="arrow-down" className="" />
            </a>
          </div>
        </section>
        <section className="section wrap" id="produto">
          <div className="section-head">
            <div>
              <p className="eyebrow">{"FEITA PARA SIMPLIFICAR"}</p>
              <h2>
                {"Menos tarefas repetitivas."}
                <br />
                <span className="muted">
                  {"Mais tempo para o que importa."}
                </span>
              </h2>
            </div>
            <p>
              {
                "Seu tempo não deveria ser consumido pelas mesmas tarefas todos os dias."
              }
            </p>
          </div>
          <div className="three benefits">
            <article>
              <Icon name="repeat-2" className="" />
              <h3>{"Rotinas automatizadas"}</h3>
              <p>
                {
                  "Configure uma tarefa e deixe que o sistema cuide das próximas execuções."
                }
              </p>
              <span className="card-number">{"01"}</span>
            </article>
            <article>
              <Icon name="panels-top-left" className="" />
              <h3>{"Tudo em um lugar"}</h3>
              <p>
                {
                  "Consulte automações, resultados e notificações em um único painel."
                }
              </p>
              <span className="card-number">{"02"}</span>
            </article>
            <article>
              <Icon name="sliders-horizontal" className="" />
              <h3>{"Controle completo"}</h3>
              <p>
                {"Ative, pause, ajuste e acompanhe suas rotinas quando quiser."}
              </p>
              <span className="card-number">{"03"}</span>
            </article>
          </div>
        </section>
        <section className="section wrap" id="como-funciona">
          <div className="center">
            <p className="eyebrow">{"DO PRIMEIRO CLIQUE À PRÓXIMA EXECUÇÃO"}</p>
            <h2>
              {"Três passos."}
              <br />
              {"Uma rotina mais simples."}
            </h2>
          </div>
          <div className="steps three">
            <article>
              <span>{"01"}</span>
              <h3>{"Escolha"}</h3>
              <p>
                {
                  "Explore o catálogo e selecione a automação que resolve seu problema."
                }
              </p>
            </article>
            <article>
              <span>{"02"}</span>
              <h3>{"Configure"}</h3>
              <p>
                {
                  "Defina suas preferências, os serviços necessários e quando executar."
                }
              </p>
            </article>
            <article>
              <span>{"03"}</span>
              <h3>{"Automatize"}</h3>
              <p>
                {"Ative a rotina e acompanhe os resultados pelo dashboard."}
              </p>
            </article>
          </div>
        </section>
        <section className="section catalog-section" id="automacoes">
          <div className="wrap">
            <div className="section-head">
              <div>
                <p className="eyebrow">
                  {"UM PONTO DE PARTIDA PARA CADA ROTINA"}
                </p>
                <h2>
                  {"Automações para"}
                  <br />
                  {"o seu dia a dia."}
                </h2>
              </div>
              <div>
                <p>
                  {
                    "Escolha tarefas prontas e personalize como elas devem funcionar."
                  }
                </p>
                <span className="badge">
                  {"Um fluxo real. Três em demonstração."}
                </span>
              </div>
            </div>
            <Catalog onSelect={onSelect} />
            <div className="center catalog-bottom">
              <button className="btn secondary" onClick={onDashboard}>
                Abrir painel e automações <Icon name="arrow-up-right" />
              </button>
            </div>
          </div>
        </section>
        <section className="section wrap" id="painel">
          <div className="center">
            <p className="eyebrow">{"VISIBILIDADE EM CADA ETAPA"}</p>
            <h2>
              {"Tudo sob controle."}
              <br />
              <span className="muted">{"Em um único painel."}</span>
            </h2>
            <p>
              {
                "Gerencie suas automações, acompanhe execuções e identifique problemas."
              }
              <br />
              {"Seu próximo passo começa com uma visão clara."}
            </p>
          </div>
          <div className="preview">
            <div className="window-bar">
              <span>{"● ● ●"}</span>
              <span>{"tectique / dashboard"}</span>
              <span className="badge">{"Dados demonstrativos"}</span>
            </div>
            <div className="preview-inner">
              <aside>
                <a className="brand" href="#">
                  <Icon name="zap" className="" />
                  {"Tectique"}
                </a>
                <span className="side-item active">
                  <Icon name="layout-dashboard" className="" />
                  {" Visão geral"}
                </span>
                <span className="side-item">
                  <Icon name="workflow" className="" />
                  {" Automações"}
                </span>
                <span className="side-item">
                  <Icon name="blocks" className="" />
                  {" Integrações"}
                </span>
                <span className="side-item">
                  <Icon name="list-checks" className="" />
                  {" Histórico"}
                </span>
                <div className="side-bottom">
                  <span className="avatar">{"T"}</span>
                  {" Workspace demo"}
                </div>
              </aside>
              <div className="preview-main">
                <div className="dash-heading">
                  <div>
                    <h3>{"Sua rotina, em movimento."}</h3>
                    <p>{"Veja o que suas automações estão fazendo."}</p>
                  </div>
                  <span className="badge">{"Últimos 7 dias"}</span>
                </div>
                <div className="metrics">
                  <div>
                    <small>{"Automações"}</small>
                    <strong>{"4"}</strong>
                    <span>{"2 ativas"}</span>
                  </div>
                  <div>
                    <small>{"Execuções"}</small>
                    <strong>{"128"}</strong>
                    <span>{"Exemplo de atividade"}</span>
                  </div>
                  <div>
                    <small>{"Taxa de sucesso"}</small>
                    <strong>
                      {"98,4"}
                      <span>{"%"}</span>
                    </strong>
                    <span>{"Dados de demonstração"}</span>
                  </div>
                </div>
                <div className="chart">
                  <div>
                    <strong>{"Atividade de execuções"}</strong>
                    <span>
                      <b className="dot"></b>
                      {" Concluídas"}
                    </span>
                  </div>
                  <div className="bars" aria-label="Gráfico ilustrativo">
                    {Array.from({ length: 42 }, (_, i) => (
                      <span
                        key={i}
                        style={{
                          height: `${20 + ((i * 17 + i * i * 3) % 76)}%`,
                        }}
                      />
                    ))}
                  </div>
                  <div className="days">
                    <span>{"Seg"}</span>
                    <span>{"Ter"}</span>
                    <span>{"Qua"}</span>
                    <span>{"Qui"}</span>
                    <span>{"Sex"}</span>
                    <span>{"Sáb"}</span>
                    <span>{"Dom"}</span>
                  </div>
                </div>
                <div className="preview-row">
                  <span>
                    <Icon name="github" className="" />
                    {" Resumo semanal do GitHub"}
                  </span>
                  <span className="status">{"✓ Concluída"}</span>
                </div>
                <div className="preview-row">
                  <span>
                    <Icon name="contact" className="" />
                    {" Resposta ao novo contato"}
                  </span>
                  <span className="status">{"✓ Concluída"}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="center">
            <button className="btn secondary" data-demo="">
              {"Abrir painel da Tectique "}
              <Icon name="arrow-up-right" className="" />
            </button>
          </div>
        </section>
        <section className="section wrap" id="diferenciais">
          <div className="section-head">
            <div>
              <p className="eyebrow">{"MENOS ATRITO. MAIS FLUIDEZ."}</p>
              <h2>
                {"Automação poderosa."}
                <br />
                {"Sem complicação."}
              </h2>
            </div>
            <p>
              {
                "Do primeiro ajuste ao histórico de execução, cada detalhe tem um propósito."
              }
            </p>
          </div>
          <div className="bento">
            <article className="large">
              <Icon name="mouse-pointer-2" className="" />
              <h3>{"Configuração simples"}</h3>
              <p>
                {
                  "Automatizadores prontos, sem exigir programação para tarefas básicas."
                }
              </p>
              <div className="mini-config">
                <span>{"Quando executar?"}</span>
                <div>
                  {"Todos os dias "}
                  <Icon name="chevron-down" className="" />
                </div>
                <div>
                  <Icon name="clock-3" className="" />
                  {" 09:00 "}
                  <span>{"America/Bahia"}</span>
                </div>
              </div>
            </article>
            <article>
              <Icon name="radio" className="" />
              <h3>{"Monitoramento contínuo"}</h3>
              <p>
                {
                  "O produto prevê execuções pelo servidor, mesmo com o navegador fechado."
                }
              </p>
              <span className="badge">{"Em desenvolvimento"}</span>
            </article>
            <article>
              <Icon name="scan-line" className="" />
              <h3>{"Transparência"}</h3>
              <p>
                {
                  "Histórico de execuções e detalhes sobre falhas para saber o que aconteceu."
                }
              </p>
            </article>
            <article className="wide">
              <div>
                <Icon name="toggle-right" className="" />
                <h3>{"Flexibilidade para mudar"}</h3>
                <p>
                  {
                    "Altere suas configurações e interrompa rotinas quando quiser. Experimente esses controles no painel demo."
                  }
                </p>
              </div>
              <button className="btn secondary" data-demo="">
                {"Experimentar "}
                <Icon name="arrow-right" className="" />
              </button>
            </article>
          </div>
        </section>
        <section className="section wrap" id="integracoes">
          <div className="section-head">
            <div>
              <p className="eyebrow">{"CONEXÕES COM PROPÓSITO"}</p>
              <h2>
                {"Suas ferramentas."}
                <br />
                <span className="muted">{"Trabalhando juntas."}</span>
              </h2>
            </div>
            <p>
              {
                "Consulte dados públicos do GitHub. Formulários, e-mail e documentos seguem em demonstração nesta versão."
              }
            </p>
          </div>
          <div className="integration-grid">
            <div>
              <Icon name="github" className="" />
              <strong>{"GitHub"}</strong>
              <span>{"Repositórios públicos"}</span>
              <small>{"Consulta real"}</small>
            </div>
            <div>
              <Icon name="contact" className="" />
              <strong>{"Formulários"}</strong>
              <span>{"Captura de contatos"}</span>
              <small>{"Demonstração"}</small>
            </div>
            <div>
              <Icon name="mail" className="" />
              <strong>{"E-mail e agenda"}</strong>
              <span>{"Respostas e lembretes"}</span>
              <small>{"Demonstração"}</small>
            </div>
            <div>
              <Icon name="files" className="" />
              <strong>{"PDFs e planilhas"}</strong>
              <span>{"Extração e conferência"}</span>
              <small>{"Demonstração"}</small>
            </div>
          </div>
        </section>
        <section className="section wrap" id="seguranca">
          <div className="security">
            <div className="shield">
              <Icon name="shield-check" className="" />
            </div>
            <div>
              <p className="eyebrow">{"VOCÊ NO COMANDO"}</p>
              <h2>{"Automatize com controle."}</h2>
              <p>
                {
                  "A Tectique está sendo projetada para dar visibilidade sobre suas automações, permissões e execuções."
                }
              </p>
              <ul>
                <li>
                  <Icon name="check" className="" />
                  {" Permissões específicas para cada integração."}
                </li>
                <li>
                  <Icon name="check" className="" />
                  {" Histórico de atividades e execução."}
                </li>
                <li>
                  <Icon name="check" className="" />
                  {" Controles para pausar ou desativar automações."}
                </li>
              </ul>
              <small>
                {
                  "GitHub Analytics faz consultas de leitura a dados públicos. Os outros fluxos são demonstrativos. Agendamentos automáticos ainda estão em desenvolvimento."
                }
              </small>
            </div>
          </div>
        </section>
        <section className="section wrap faq" id="perguntas">
          <div>
            <p className="eyebrow">{"ANTES DE COMEÇAR"}</p>
            <h2>
              {"Suas perguntas."}
              <br />
              {"Respostas claras."}
            </h2>
            <p>
              {"Conheça o que já pode experimentar"}
              <br />
              {"e o que estamos construindo."}
            </p>
          </div>
          <FAQ />
        </section>
        <section className="wrap final-cta">
          <div className="cta-orbit" aria-hidden="true"></div>
          <p className="eyebrow">{"ABRA ESPAÇO PARA O PRÓXIMO PASSO"}</p>
          <h2>
            {"Seu tempo vale mais do que"}
            <br />
            {"tarefas repetitivas."}
          </h2>
          <p>
            {"Descubra uma forma mais simples de automatizar processos"}
            <br />
            {"e organizar suas rotinas digitais."}
          </p>
          <button className="btn primary" data-demo="">
            {"Começar com a Tectique "}
            <Icon name="arrow-right" className="" />
          </button>
          <small>{"Abrir painel · Sem cadastro nesta versão local"}</small>
        </section>
      </main>
      <footer className="wrap">
        <div className="footer-grid">
          <div>
            <a className="brand" href="#">
              <Icon name="zap" className="" />
              {"Tectique"}
            </a>
            <p>
              {"Menos tarefas repetitivas."}
              <br />
              {"Mais espaço para suas ideias."}
            </p>
          </div>
          <div>
            <strong>{"Plataforma"}</strong>
            <a href="#automacoes">{"Automações"}</a>
            <a href="#integracoes">{"Integrações"}</a>
            <a href="#como-funciona">{"Como funciona"}</a>
          </div>
          <div>
            <strong>{"Recursos"}</strong>
            <button data-docs="">{"Sobre a demonstração"}</button>
            <a href="#perguntas">{"Perguntas frequentes"}</a>
            <button data-demo="">{"Explorar painel"}</button>
          </div>
          <div>
            <strong>{"Transparência"}</strong>
            <a href="#seguranca">{"Segurança e controle"}</a>
            <span>{"Produto em desenvolvimento"}</span>
            <span>{"Termos e privacidade: em preparação"}</span>
          </div>
        </div>
        <div className="footer-bottom">
          <span>{"© 2026 Tectique"}</span>
          <span>
            {"Feita para deixar o trabalho fluir. "}
            <Icon name="zap" className="" />
          </span>
        </div>
      </footer>
    </div>
  );
}
