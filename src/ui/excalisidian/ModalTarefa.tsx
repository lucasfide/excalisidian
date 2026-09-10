// Modal de detalhe da tarefa (doc 10 §5.5): desliza da direita cobrindo só a largura do
// painel. Título editável, status em button-group e a lista de comentários.

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { BotaoIcone, GrupoBotoes } from "../index";
import ComentariosTarefa from "./ComentariosTarefa";
import { useTarefasStore } from "../../estado/tarefasStore";
import { secaoDe } from "../../tarefas/agrupamento";
import type { Secao, Tarefa } from "../../tarefas/tipos";

const OPCOES: { rotulo: string; valor: Exclude<Secao, "atrasado"> }[] = [
  { rotulo: "Hoje", valor: "hoje" },
  { rotulo: "Amanhã", valor: "amanha" },
  { rotulo: "Essa semana", valor: "essa-semana" },
  { rotulo: "Próxima semana", valor: "proxima-semana" },
  { rotulo: "Concluídas", valor: "concluidas" },
];

interface Props {
  tarefa: Tarefa;
  hoje: string;
}

export default function ModalTarefa({ tarefa, hoje }: Props) {
  const fecharModal = useTarefasStore((s) => s.fecharModal);
  const editarTitulo = useTarefasStore((s) => s.editarTitulo);
  const moverTarefa = useTarefasStore((s) => s.moverTarefa);
  const alternarConcluida = useTarefasStore((s) => s.alternarConcluida);

  const [titulo, setTitulo] = useState(tarefa.titulo);
  useEffect(() => setTitulo(tarefa.titulo), [tarefa.id, tarefa.titulo]);

  // Esc fecha. Captura em `window` para pegar o evento antes de outros handlers.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Um campo interno que trata o Escape sozinho (cancelar a edição inline de um
      // comentário) marca `preventDefault` e/ou fica dentro de `[data-edicao-comentario]`.
      // Nesse caso o modal não fecha e o rascunho não é perdido. O `data-*` é o sinal
      // confiável: este handler é de captura e roda antes do onKeyDown do textarea.
      if (e.defaultPrevented) return;
      if ((e.target as Element)?.closest?.("[data-edicao-comentario]")) return;
      fecharModal();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [fecharModal]);

  // Clique fora: o modal cobre o painel inteiro, então "fora" = qualquer ponto que não
  // esteja dentro do `<aside id="painel-tarefas">` (o editor/Workspace à esquerda).
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      // O toast do sonner é renderizado no body, fora de #painel-tarefas: sem esta guarda,
      // clicar em "Desfazer" contaria como clique fora e fecharia o modal.
      if ((e.target as Element)?.closest?.("[data-sonner-toaster]")) return;
      const painel = document.getElementById("painel-tarefas");
      if (painel && !painel.contains(e.target as Node)) fecharModal();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [fecharModal]);

  const secaoAtual = secaoDe(tarefa, hoje);

  function salvarTitulo() {
    const t = titulo.trim();
    if (t && t !== tarefa.titulo) editarTitulo(tarefa.id, t);
    else if (!t) setTitulo(tarefa.titulo);
  }

  function escolherStatus(valor: Exclude<Secao, "atrasado">) {
    // O GrupoBotoes dispara onEscolher até para a opção já ativa; sem esta saída, clicar na
    // seção atual chamaria moverTarefa e reordenaria a tarefa para o topo (sem desfazer).
    if (valor === secaoAtual) return;
    if (valor === "concluidas") {
      if (!tarefa.concluida) alternarConcluida(tarefa.id, hoje);
      return;
    }
    // mover para uma seção com data; indice 0 (topo). O store reescreve vencimento e,
    // se estava concluída, reabre.
    moverTarefa(tarefa.id, valor, 0, hoje);
  }

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-superficie shadow-sobreposicao">
      <div className="flex items-center justify-between border-b border-regua px-3 py-2">
        <span className="text-[11px] uppercase tracking-wide text-tinta-suave">Tarefa</span>
        <BotaoIcone Icone={X} titulo="Fechar" onClick={fecharModal} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-3">
        <textarea
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          onBlur={salvarTitulo}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              salvarTitulo();
              (e.target as HTMLTextAreaElement).blur();
            }
          }}
          rows={2}
          className="w-full resize-none rounded-controle bg-transparent px-1 py-1 text-[15px] font-medium text-tinta focus:bg-papel focus:outline-none"
        />

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-tinta-suave">Status</span>
          <div className="flex items-center gap-2">
            <GrupoBotoes
              opcoes={OPCOES}
              valor={secaoAtual === "atrasado" ? undefined : secaoAtual}
              onEscolher={escolherStatus}
              rotuloGrupo="Status da tarefa"
            />
            {secaoAtual === "atrasado" && (
              <span className="text-[11px] text-bordo">Atrasado</span>
            )}
          </div>
        </div>

        <ComentariosTarefa tarefa={tarefa} />
      </div>
    </div>
  );
}
