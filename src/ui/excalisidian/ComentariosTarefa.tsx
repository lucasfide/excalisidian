// Comentários da tarefa (doc 10 §5.5): lista com carimbo, [[wikilink]] clicável, adicionar,
// editar inline e apagar com desfazer.

import { useState, Fragment } from "react";
import { toast } from "sonner";

import { useTarefasStore } from "../../estado/tarefasStore";
import { abrirOuCriarPorLink } from "../../vault/navegacao";
import type { Comentario, Tarefa } from "../../tarefas/tipos";

function formatarCarimbo(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Renderiza o texto quebrando em [[wikilink]] clicáveis. `origem` vazia: resolve da raiz. */
function TextoComLinks({ texto }: { texto: string }) {
  const partes = texto.split(/(\[\[[^\]]+\]\])/g);
  return (
    <span className="whitespace-pre-wrap break-words">
      {partes.map((p, i) => {
        const m = /^\[\[([^\]]+)\]\]$/.exec(p);
        if (!m) return <Fragment key={i}>{p}</Fragment>;
        const alvo = m[1].split("|")[0].split("#")[0].trim();
        return (
          <button
            key={i}
            type="button"
            onClick={() => void abrirOuCriarPorLink(alvo, "")}
            className="text-musgo underline decoration-dotted underline-offset-2 hover:decoration-solid"
          >
            {m[1]}
          </button>
        );
      })}
    </span>
  );
}

interface Props {
  tarefa: Tarefa;
}

export default function ComentariosTarefa({ tarefa }: Props) {
  const adicionar = useTarefasStore((s) => s.adicionarComentario);
  const editar = useTarefasStore((s) => s.editarComentario);
  const remover = useTarefasStore((s) => s.removerComentario);
  const restaurar = useTarefasStore((s) => s.restaurarComentario);

  const [novo, setNovo] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState("");

  function enviarNovo(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const t = novo.trim();
      if (t) adicionar(tarefa.id, t);
      setNovo("");
    }
  }

  function apagar(c: Comentario, indice: number) {
    remover(tarefa.id, c.id);
    toast("Comentário apagado", {
      action: { label: "Desfazer", onClick: () => restaurar(tarefa.id, c, indice) },
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] uppercase tracking-wide text-tinta-suave">Comentários</span>

      <div className="flex flex-col gap-2">
        {tarefa.comentarios.map((c, i) => (
          <div key={c.id} className="group rounded-ficha border border-regua px-2 py-1.5 text-[13px] text-tinta">
            <div className="mb-0.5 flex items-center gap-2 text-[10px] text-tinta-suave">
              <span>{formatarCarimbo(c.criadoEm)}</span>
              {c.editadoEm && <span>· Editado</span>}
              <span className="ml-auto flex gap-2 opacity-0 group-hover:opacity-100">
                <button type="button" className="hover:text-tinta" onClick={() => { setEditandoId(c.id); setRascunho(c.texto); }}>
                  Editar
                </button>
                <button type="button" className="hover:text-bordo" onClick={() => apagar(c, i)}>
                  Apagar
                </button>
              </span>
            </div>
            {editandoId === c.id ? (
              <textarea
                autoFocus
                value={rascunho}
                onChange={(e) => setRascunho(e.target.value)}
                onBlur={() => {
                  const t = rascunho.trim();
                  if (t && t !== c.texto) editar(tarefa.id, c.id, t);
                  setEditandoId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); }
                  if (e.key === "Escape") { setEditandoId(null); }
                }}
                rows={2}
                className="w-full resize-none rounded-controle border border-regua-forte bg-papel px-2 py-1 text-[13px] text-tinta focus:border-musgo focus:outline-none"
              />
            ) : (
              <TextoComLinks texto={c.texto} />
            )}
          </div>
        ))}
      </div>

      <textarea
        value={novo}
        onChange={(e) => setNovo(e.target.value)}
        onKeyDown={enviarNovo}
        rows={2}
        placeholder="Escrever um comentário"
        className="w-full resize-none rounded-controle border border-regua-forte bg-papel px-2 py-1 text-[13px] text-tinta placeholder:text-tinta-suave focus:border-musgo focus:outline-none"
      />
    </div>
  );
}
