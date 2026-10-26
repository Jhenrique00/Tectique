import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Landing } from "./Landing";
import { Dashboard } from "./Dashboard";
import { Modal } from "./components/Modal";
import type { Automation } from "./data";
import "./theme.css";
import "./app.css";
function App() {
  const [hash, setHash] = useState(location.hash);
  const [selected, setSelected] = useState<Automation | null>(null);
  useEffect(() => {
    const changed = () => setHash(location.hash);
    addEventListener("hashchange", changed);
    return () => removeEventListener("hashchange", changed);
  }, []);
  const openDashboard = () => {
    setSelected(null);
    location.hash = "/dashboard";
    window.scrollTo(0, 0);
  };
  return (
    <>
      {hash.startsWith("#/dashboard") ? (
        <Dashboard onSelect={setSelected} />
      ) : (
        <Landing onDashboard={openDashboard} onSelect={setSelected} />
      )}{" "}
      {selected && (
        <Modal title={selected.name} onClose={() => setSelected(null)}>
          <span className="badge">
            {selected.id === "github"
              ? "Disponível · manual e agendada"
              : "Demonstração de fluxo"}
          </span>
          <p>{selected.description}</p>
          <p>{selected.audience}</p>
          <h3>Etapas</h3>
          <ol>
            {selected.steps.map((s, i) => (
              <li key={s}>
                {selected.id === "github" && i === 1
                  ? "Configure uma consulta manual ou crie uma rotina automática no painel."
                  : s}
              </li>
            ))}
          </ol>
          {selected.id === "github" ? (
            <button className="btn primary" onClick={openDashboard}>
              Consultar repositório público
            </button>
          ) : (
            <p>
              Este fluxo está planejado. Ainda não coleta contatos, envia
              e-mails, agenda compromissos ou processa documentos.
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
