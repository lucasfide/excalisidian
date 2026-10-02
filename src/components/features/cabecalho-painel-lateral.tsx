import type { ReactNode } from "react";
import { PanelRightClose } from "lucide-react";
import BotaoIcone from "../../ui/BotaoIcone";

interface CabecalhoPainelLateralProps {
  ativo: "agente" | "tarefas";
  aoMostrarAgente(): void;
  aoMostrarTarefas(): void;
  aoFechar(): void;
  acoes?: ReactNode;
}

export default function CabecalhoPainelLateral({
  ativo, aoMostrarAgente, aoMostrarTarefas, aoFechar, acoes,
}: CabecalhoPainelLateralProps) {
  return (
    <header className="painel-lateral-trabalho__cabecalho">
      <nav className="painel-lateral-trabalho__nav" aria-label="Painel lateral">
        <button type="button" aria-current={ativo === "agente" ? "page" : undefined} onClick={aoMostrarAgente}>Agente</button>
        <button type="button" aria-current={ativo === "tarefas" ? "page" : undefined} onClick={aoMostrarTarefas}>Tarefas</button>
      </nav>
      <div className="painel-lateral-trabalho__acoes">{acoes}</div>
      <BotaoIcone Icone={PanelRightClose} titulo="Colapsar painel lateral" className="h-11 w-11 shrink-0" onClick={aoFechar} />
    </header>
  );
}
