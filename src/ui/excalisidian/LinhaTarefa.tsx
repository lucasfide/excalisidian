// Uma linha do painel de tarefas (doc 10 §4.3): alça de arraste + checkbox + título + apagar.
// Clique no título (fora do checkbox e da alça) abre o modal de detalhe. A alça `grip-vertical`
// só aparece no hover e é a origem do arraste (doc 10 §5.2): `pointerdown` botão 0 nela registra
// listeners em `window` de pointermove/pointerup/pointercancel — nunca HTML5 drag-and-drop
// (doc 09 ADR-18), mesmo padrão de `editor/extensoes/moverBloco.ts`.

import { GripVertical, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "../cn";
import { Checkbox } from "../index";
import { useTarefasStore } from "../../estado/tarefasStore";
import type { Secao, Tarefa } from "../../tarefas/tipos";

interface Props {
  tarefa: Tarefa;
  hoje: string;
  /** Seção onde a linha está sendo renderizada — vira a `origem` do arraste. */
  secao?: Secao;
  /** Posição visual na seção; exposta como `data-indice` (a geometria da soltura mede pelos
   * retângulos, este atributo é só para inspeção). */
  indice?: number;
  /** `true` enquanto esta linha é a que está sendo arrastada — fica `opacity-40`. */
  arrastando?: boolean;
  aoIniciarArrasto?: (id: string, origem: Secao) => void;
  aoMoverPonteiro?: (x: number, y: number) => void;
  aoSoltar?: () => void;
  /** Chamado quando o ponteiro é cancelado (toque/caneta interrompido, gesto do SO): limpa
   * o estado de arraste SEM cometer o movimento. */
  aoCancelarArrasto?: () => void;
}

export default function LinhaTarefa({
  tarefa,
  hoje,
  secao,
  indice,
  arrastando = false,
  aoIniciarArrasto,
  aoMoverPonteiro,
  aoSoltar,
  aoCancelarArrasto,
}: Props) {
  const alternarConcluida = useTarefasStore((s) => s.alternarConcluida);
  const abrirModal = useTarefasStore((s) => s.abrirModal);
  const removerTarefa = useTarefasStore((s) => s.removerTarefa);
  const restaurarTarefa = useTarefasStore((s) => s.restaurarTarefa);

  function apagar() {
    removerTarefa(tarefa.id);
    toast("Tarefa apagada", {
      action: { label: "Desfazer", onClick: () => restaurarTarefa(tarefa) },
    });
  }

  function aoPegarAlca(e: React.PointerEvent) {
    if (e.button !== 0 || !aoIniciarArrasto || !secao) return;
    e.preventDefault();
    e.stopPropagation();
    aoIniciarArrasto(tarefa.id, secao);
    const mover = (ev: PointerEvent) => aoMoverPonteiro?.(ev.clientX, ev.clientY);
    const limpar = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", encerrar);
      window.removeEventListener("pointercancel", cancelar);
    };
    const encerrar = () => {
      limpar();
      aoSoltar?.();
    };
    const cancelar = () => {
      limpar();
      aoCancelarArrasto?.();
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", encerrar);
    window.addEventListener("pointercancel", cancelar);
  }

  return (
    <div
      data-tarefa-id={tarefa.id}
      data-secao={secao}
      data-indice={indice}
      className={cn(
        "group flex items-center gap-2 rounded-controle px-1 py-1 hover:bg-lavagem",
        arrastando && "opacity-40",
      )}
    >
      <button
        type="button"
        aria-label="Arrastar para reordenar"
        title="Arrastar para reordenar"
        tabIndex={-1}
        onPointerDown={aoPegarAlca}
        className="-ml-1 shrink-0 cursor-grab text-tinta-suave opacity-0 group-hover:opacity-100 active:cursor-grabbing"
      >
        <GripVertical size={14} strokeWidth={1.5} aria-hidden />
      </button>
      <Checkbox
        checked={tarefa.concluida}
        onChange={() => alternarConcluida(tarefa.id, hoje)}
        rotulo={tarefa.concluida ? "Reabrir tarefa" : "Concluir tarefa"}
      />
      <button
        type="button"
        onClick={() => abrirModal(tarefa.id)}
        className={cn(
          "min-w-0 flex-1 truncate text-left text-[13px]",
          tarefa.concluida ? "text-tinta-suave line-through" : "text-tinta",
        )}
      >
        {tarefa.titulo}
      </button>
      <button
        type="button"
        onClick={apagar}
        aria-label="Apagar tarefa"
        title="Apagar tarefa"
        className="shrink-0 text-tinta-suave opacity-0 hover:text-bordo group-hover:opacity-100"
      >
        <Trash2 size={14} strokeWidth={1.5} aria-hidden />
      </button>
    </div>
  );
}
