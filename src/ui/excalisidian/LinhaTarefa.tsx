// Uma linha do painel de tarefas (doc 10 §4.3): checkbox + título. Clique na linha (fora do
// checkbox) abre o modal de detalhe. A alça de arraste entra no Task 9.

import { cn } from "../cn";
import { Checkbox } from "../index";
import { useTarefasStore } from "../../estado/tarefasStore";
import type { Tarefa } from "../../tarefas/tipos";

interface Props {
  tarefa: Tarefa;
  hoje: string;
}

export default function LinhaTarefa({ tarefa, hoje }: Props) {
  const alternarConcluida = useTarefasStore((s) => s.alternarConcluida);
  const abrirModal = useTarefasStore((s) => s.abrirModal);

  return (
    <div className="group flex items-center gap-2 rounded-controle px-1 py-1 hover:bg-lavagem">
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
    </div>
  );
}
