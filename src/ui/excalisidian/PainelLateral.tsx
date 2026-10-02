import { useAgenteStore } from "../../estado/agenteStore";
import { useTarefasStore } from "../../estado/tarefasStore";
import { useTexto } from "../../i18n/useTexto";
import { cn } from "../cn";
import PainelAgente from "./PainelAgente";
import PainelTarefas from "./PainelTarefas";
import CabecalhoPainelLateral from "./CabecalhoPainelLateral";

export interface PainelLateralProps {
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

export default function PainelLateral({ aoAbrirConta }: PainelLateralProps) {
  const t = useTexto();
  const habilitado = useAgenteStore((s) => s.config?.habilitado ?? false);
  const agenteAberto = useAgenteStore((s) => s.painelAberto && Boolean(s.config?.habilitado));
  const tarefasAberto = useTarefasStore((s) => s.painelAberto);
  const larguraTarefas = useTarefasStore((s) => s.larguraPainel);

  return (
    <div
      className={cn(
        "relative flex min-h-0 flex-none flex-col",
        agenteAberto &&
          "border-l border-regua max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-[90] max-lg:h-[min(80dvh,42rem)] max-lg:w-full! max-lg:border-l-0 max-lg:border-t max-lg:shadow-sobreposicao",
      )}
      style={{ width: larguraTarefas }}
      hidden={!agenteAberto && !tarefasAberto}
    >
      <div
        className={cn(
          "absolute left-0 top-0 z-10 h-full w-2 -translate-x-1/2 cursor-col-resize touch-none",
          agenteAberto && "max-lg:hidden",
        )}
        hidden={!habilitado}
        role="separator"
        aria-label={t("painelLateral.largura")}
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
      >
        <div className="mx-auto h-full w-px bg-regua" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col [&>#painel-tarefas]:min-h-0 [&>#painel-tarefas]:flex-1" hidden={agenteAberto}>
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
