import { useEffect, useRef, useState, type FormEvent } from "react";
import { fetchReport, type Report, type Activity } from "../api";
import { Icon } from "./Icon";
function Items({ title, items }: { title: string; items: Activity[] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section className="report-list">
      <h3>
        {title} <span className="badge">{items.length}</span>
      </h3>
      {items.length === 0 ? (
        <p>Nenhum item recuperado neste período.</p>
      ) : (
        <>
          <ul>
            {(expanded ? items : items.slice(0, 10)).map((item) => (
              <li key={item.id}>
                <a href={item.url} target="_blank" rel="noopener noreferrer">
                  {item.title}
                </a>
                <small>
                  {item.author} · {new Date(item.date).toLocaleString("pt-BR")}
                  {item.state
                    ? " · " + (item.state === "open" ? "Aberta" : "Fechada")
                    : ""}
                </small>
              </li>
            ))}
          </ul>
          {items.length > 10 && (
            <button
              className="btn secondary small"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Mostrar menos" : `Mostrar todos (${items.length})`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
function download(report: Report) {
  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tectique-${report.repository.replace("/", "-")}-${report.days}dias.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function GitHubAnalytics({
  onReport,
  selectedReport,
}: {
  onReport: (report: Report) => void;
  selectedReport?: Report | null;
}) {
  const [repository, setRepository] = useState("Jhenrique00/NandoSync");
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<Report | null>(selectedReport ?? null);
  useEffect(() => { if(selectedReport) setReport(selectedReport); }, [selectedReport]);
  const request = useRef<AbortController | null>(null);
  const result = useRef<HTMLElement>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    setReport(null);
    const timer = setTimeout(() => controller.abort(), 120000);
    try {
      const value = await fetchReport(
        repository.trim(),
        days,
        controller.signal,
      );
      setReport(value);
      onReport(value);
      setTimeout(() => result.current?.focus(), 0);
    } catch (e) {
      setError(
        e instanceof Error && e.name === "AbortError"
          ? "Consulta cancelada ou tempo limite atingido. Você pode tentar novamente."
          : e instanceof TypeError
            ? "Não foi possível acessar a API. Verifique se o back-end está rodando na porta 8000."
            : e instanceof Error
              ? e.message
              : "Falha ao consultar o GitHub.",
      );
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }
  return (
    <section className="analytics">
      <div className="section-head">
        <div>
          <p className="eyebrow">DADOS REAIS · SOMENTE LEITURA</p>
          <h2>GitHub Analytics</h2>
        </div>
        <span className="badge">Consultas salvas na sua conta</span>
      </div>
      <p>
        Consulte commits da branch padrão e issues e pull requests atualizados
        no período. Informe um repositório público.
      </p>
      <form className="analytics-form" onSubmit={submit}>
        <label>
          Repositório público
          <input
            required
            maxLength={250}
            value={repository}
            onChange={(e) => setRepository(e.target.value)}
            placeholder="usuario/repositorio ou URL do GitHub"
            disabled={loading}
          />
        </label>
        <label>
          Período
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            disabled={loading}
          >
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={90}>Últimos 90 dias</option>
          </select>
        </label>
        <button className="btn primary" type="submit" disabled={loading}>
          <Icon
            name={loading ? "loader" : "github"}
            className={loading ? "spin" : ""}
          />
          {loading ? "Consultando GitHub…" : "Gerar resumo"}
        </button>
        {loading && (
          <button
            type="button"
            className="btn secondary"
            onClick={() => request.current?.abort()}
          >
            Cancelar
          </button>
        )}
      </form>
      <p className="form-help">
        Até 300 commits e 300 itens de issues/PRs por consulta. Resultados
        maiores são identificados como parciais. Nenhum token é solicitado no
        navegador.
      </p>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {loading && (
        <p role="status">Buscando dados públicos e montando o relatório…</p>
      )}
      {report && (
        <section
          ref={result}
          tabIndex={-1}
          className="report"
          aria-label="Resultado da consulta"
        >
          <div className="dash-heading">
            <div>
              <a
                href={report.repository_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <h3>
                  {report.repository} <Icon name="arrow-up-right" />
                </h3>
              </a>
              <p>
                Branch: {report.default_branch} · Gerado em{" "}
                {new Date(report.generated_at).toLocaleString("pt-BR")}
              </p>
            </div>
            <button
              className="btn secondary small"
              onClick={() => download(report)}
            >
              <Icon name="download" />
              Baixar JSON
            </button>
          </div>
          {report.partial && (
            <div className="alert warning" role="status">
              Resultado parcial: as contagens abaixo representam somente os
              itens recuperados.
            </div>
          )}
          <div className="metrics">
            <div>
              <small>Commits recuperados</small>
              <strong>{report.commits.length}</strong>
            </div>
            <div>
              <small>Issues atualizadas</small>
              <strong>{report.issues.length}</strong>
            </div>
            <div>
              <small>PRs atualizados</small>
              <strong>{report.pull_requests.length}</strong>
            </div>
          </div>
          <p className="summary-text">{report.summary}</p>
          <details className="method">
            <summary>Como interpretar estes dados</summary>
            <ul>
              {report.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </details>
          <Items
            key={report.generated_at + "c"}
            title="Commits"
            items={report.commits}
          />
          <Items
            key={report.generated_at + "i"}
            title="Issues"
            items={report.issues}
          />
          <Items
            key={report.generated_at + "p"}
            title="Pull requests"
            items={report.pull_requests}
          />
        </section>
      )}
    </section>
  );
}
