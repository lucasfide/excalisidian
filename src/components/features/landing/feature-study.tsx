import { useState } from "react";
import { Check, FileText, GitBranch } from "lucide-react";
import "./feature-study.css";

interface FeatureStudyProps {
  kind: "notes" | "diagrams" | "tasks";
}

export function FeatureStudy({ kind }: FeatureStudyProps) {
  const [selected, setSelected] = useState(false);
  const [activeNode, setActiveNode] = useState("ideia");

  if (kind === "notes") {
    return <div className="feature-study feature-study--note">
      <div className="feature-study__bar"><FileText size={14} aria-hidden="true" /><span>projeto.md</span><span>01</span></div>
      <div className="feature-study__paper feature-study__markdown">
        <span className="feature-study__date">MARKDOWN</span>
        <code># Projeto</code>
        <p>- [ ] Revisar referências</p>
        <p>- [x] [[Mapa de ideias]]</p>
        <table className="feature-study__table"><thead><tr><th>Status</th><th>Próximo passo</th></tr></thead><tbody><tr><td>Em andamento</td><td>Escrever a nota</td></tr></tbody></table>
        <span className="feature-study__hint">atalhos, blocos e links entre notas</span>
      </div>
    </div>;
  }

  if (kind === "diagrams") {
    return <div className="feature-study feature-study--diagram">
      <div className="feature-study__bar"><GitBranch size={14} aria-hidden="true" /><span>excalidraw / mapa de ideias</span><span>02</span></div>
      <div className="feature-study__map" data-active={activeNode}>
        <svg viewBox="0 0 440 250" preserveAspectRatio="none" aria-hidden="true">
          <path className="feature-study__connection" d="M220 70 C220 130 105 105 105 170 M220 70 C220 130 335 105 335 170" />
          <path className="feature-study__connection-highlight" d={activeNode === "nota" ? "M220 70 C220 130 105 105 105 170" : activeNode === "tarefa" ? "M220 70 C220 130 335 105 335 170" : "M220 70 C220 130 105 105 105 170 M220 70 C220 130 335 105 335 170"} />
        </svg>
        <button className="feature-study__node feature-study__node--idea" type="button" aria-pressed={activeNode === "ideia"} onClick={() => setActiveNode("ideia")}>Uma ideia</button>
        <button className="feature-study__node feature-study__node--note" type="button" aria-pressed={activeNode === "nota"} onClick={() => setActiveNode("nota")}>Uma nota</button>
        <button className="feature-study__node feature-study__node--task" type="button" aria-pressed={activeNode === "tarefa"} onClick={() => setActiveNode("tarefa")}>Um próximo passo</button>
      </div>
      <p className="feature-study__hint feature-study__diagram-hint">Links entre notas e diagramas.</p>
    </div>;
  }

  return <div className="feature-study feature-study--tasks">
    <div className="feature-study__bar"><Check size={14} aria-hidden="true" /><span>tarefas</span><span>03</span></div>
    <div className="feature-study__task-body">
      <div className="feature-study__task-categories" aria-label="Status disponíveis"><span>Hoje</span><span>Amanhã</span><span>Essa semana</span><span>Semana que vem</span></div>
      <span className="feature-study__date">HOJE</span>
      <button type="button" className="feature-study__task" aria-pressed={selected} onClick={() => setSelected(value => !value)}><span className="feature-study__checkbox">{selected && <Check size={14} aria-hidden="true" />}</span><span>Revisar a nota</span></button>
    </div>
  </div>;
}
