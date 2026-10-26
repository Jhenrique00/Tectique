import { useState } from "react";
import { Icon } from "./Icon";
import { automations, type Automation } from "../data";
export function Header({ onDashboard }: { onDashboard: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <header>
      <div className="nav wrap">
        <a className="brand" href="#/" aria-label="Tectique início">
          <Icon name="zap" />
          Tectique<span className="beta">ALPHA</span>
        </a>
        <nav
          id="nav-links"
          className={open ? "open" : ""}
          aria-label="Principal"
        >
          {[
            ["produto", "Produto"],
            ["automacoes", "Automações"],
            ["como-funciona", "Como funciona"],
            ["integracoes", "Integrações"],
            ["seguranca", "Segurança"],
          ].map(([id, name]) => (
            <a key={id} href={"#" + id} onClick={() => setOpen(false)}>
              {name}
            </a>
          ))}
        </nav>
        <button className="btn small secondary desktop" onClick={onDashboard}>
          Explorar painel <Icon name="arrow-up-right" />
        </button>
        <button
          className="icon-button menu"
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          aria-expanded={open}
          aria-controls="nav-links"
          onClick={() => setOpen(!open)}
        >
          <Icon name={open ? "x" : "menu"} />
        </button>
      </div>
    </header>
  );
}
export function Catalog({
  onSelect,
}: {
  onSelect: (item: Automation) => void;
}) {
  const [filter, setFilter] = useState("Todas");
  return (
    <>
      <div className="filters" role="group" aria-label="Filtrar automações">
        {["Todas", ...automations.map((a) => a.category)].map((c) => (
          <button
            key={c}
            className={filter === c ? "selected" : ""}
            aria-pressed={filter === c}
            onClick={() => setFilter(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="catalog-grid" id="catalog">
        {automations
          .filter((a) => filter === "Todas" || a.category === filter)
          .map((a) => (
            <article className="catalog-card" key={a.id}>
              <div className="top">
                <div className="app-icon">
                  <Icon name={a.icon} />
                </div>
                <span className="badge">
                  {a.id === "github"
                    ? "Disponível · manual e agendada"
                    : "Demonstração"}
                </span>
              </div>
              <h3>{a.name}</h3>
              <p>{a.description}</p>
              <p className="audience">{a.audience}</p>
              <span className="category">{a.category}</span>
              <button className="text-button" onClick={() => onSelect(a)}>
                Conhecer automação <Icon name="arrow-up-right" />
              </button>
            </article>
          ))}
      </div>
    </>
  );
}
const faqs = [
  [
    "O que já funciona nesta versão?",
    "GitHub Analytics gera relatórios de repositórios públicos, salva o histórico no PostgreSQL e permite rotinas agendadas por conta. Os demais fluxos ainda são demonstrativos.",
  ],
  [
    "Preciso saber programar para utilizar?",
    "A interface permite informar um repositório e consultar o relatório. Para executar esta versão local, siga o README do projeto.",
  ],
  [
    "É gratuito?",
    "Esta versão de desenvolvimento não tem cobrança. O GitHub impõe limites à sua API, compartilhados pelo IP do servidor quando não há token.",
  ],
  [
    "Funciona com o navegador fechado?",
    "Sim, você pode fechar a aba do navegador. O agendador continua funcionando enquanto o servidor Tectique estiver aberto no terminal. Com o computador ou programa desligado, as rotinas ficam suspensas.",
  ],
  [
    "Quais integrações estão disponíveis?",
    "A consulta de dados públicos do GitHub está implementada. Captura de contatos, e-mails, agenda e processamento de documentos seguem em demonstração.",
  ],
  [
    "Onde meus relatórios ficam salvos?",
    "Relatórios e rotinas ficam no PostgreSQL local, associados à sua conta. O histórico é mantido ao reiniciar a Tectique, desde que a pasta .local seja preservada.",
  ],
];
export function FAQ() {
  return (
    <div id="faqs">
      {faqs.map(([q, a]) => (
        <details key={q}>
          <summary>{q}</summary>
          <p>{a}</p>
        </details>
      ))}
    </div>
  );
}
