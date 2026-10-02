import type { CSSProperties } from "react";
import { useAgenteStore } from "../../estado/agenteStore";
import { useTarefasStore } from "../../estado/tarefasStore";
import PainelAgente from "../../ui/excalisidian/PainelAgente";
import PainelTarefas from "../../ui/excalisidian/PainelTarefas";
import CabecalhoPainelLateral from "./cabecalho-painel-lateral";
import "./painel-lateral-agente.css";

export interface PainelLateralAgenteProps {
  aoAbrirConta(): void;
}

/** Alternância local autorizada: preserva preferências e conteúdo do painel de tarefas. */
export function mostrarTarefasNoPainel(): void {
  const agente = useAgenteStore.getState();
  if (agente.painelAberto) agente.alternarPainel();
  const tarefas = useTarefasStore.getState();
  if (!tarefas.painelAberto) tarefas.alternarPainel();
}

function fecharPainelLateral(): void {
  const agente = useAgenteStore.getState();
  if (agente.painelAberto) agente.alternarPainel();
  const tarefas = useTarefasStore.getState();
  if (tarefas.painelAberto) tarefas.alternarPainel();
}

export default function PainelLateralAgente({ aoAbrirConta }: PainelLateralAgenteProps) {
  const habilitado = useAgenteStore((s) => s.config?.habilitado ?? false);
  const agenteAberto = useAgenteStore((s) => s.painelAberto && Boolean(s.config?.habilitado));
  const tarefasAberto = useTarefasStore((s) => s.painelAberto);
  const larguraTarefas = useTarefasStore((s) => s.larguraPainel);

  return (
    <div
      className={`painel-lateral-trabalho${agenteAberto ? " painel-lateral-trabalho--agente" : ""}`}
      style={{ "--largura-painel-trabalho": `${larguraTarefas}px` } as CSSProperties}
      hidden={!agenteAberto && !tarefasAberto}
    >
      <div
        className="painel-lateral-trabalho__divisoria"
        hidden={!habilitado}
        role="separator"
        aria-label="Largura do painel lateral"
        aria-orientation="vertical"
        aria-valuemin={280}
        aria-valuemax={480}
        aria-valuenow={larguraTarefas}
        tabIndex={0}
        onPointerDown={(evento) => {
          if (evento.button !== 0) return;
          evento.preventDefault();
          evento.currentTarget.setPointerCapture(evento.pointerId);
        }}
        onPointerMove={(evento) => {
          if (evento.currentTarget.hasPointerCapture(evento.pointerId)) {
            useTarefasStore.getState().definirLargura(window.innerWidth - evento.clientX);
          }
        }}
        onPointerUp={(evento) => {
          if (evento.currentTarget.hasPointerCapture(evento.pointerId)) {
            evento.currentTarget.releasePointerCapture(evento.pointerId);
          }
        }}
        onKeyDown={(evento) => {
          if (evento.key !== "ArrowLeft" && evento.key !== "ArrowRight") return;
          evento.preventDefault();
          useTarefasStore.getState().definirLargura(larguraTarefas + (evento.key === "ArrowLeft" ? 16 : -16));
        }}
      />
      <div className="painel-lateral-trabalho__tarefas" hidden={agenteAberto}>
        <PainelTarefas cabecalho={habilitado ? (
          <CabecalhoPainelLateral
            ativo="tarefas"
            aoMostrarAgente={() => useAgenteStore.getState().alternarPainel()}
            aoMostrarTarefas={mostrarTarefasNoPainel}
            aoFechar={fecharPainelLateral}
          />
        ) : undefined} />
      </div>
      <PainelAgente aoAbrirConta={aoAbrirConta} aoMostrarTarefas={mostrarTarefasNoPainel} aoFecharPainel={fecharPainelLateral} />
    </div>
  );
}
