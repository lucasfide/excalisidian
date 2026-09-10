// Criação de tarefa em cadeia (doc 10 §5.1). O botão "Nova tarefa" abre um input; Enter com
// texto cria e reabre outro input; Enter vazio / Esc / blur vazio encerram; blur com texto
// cria e encerra a cadeia. Tarefa sem título nunca chega ao disco.

import { useRef, useState } from "react";
import { Plus } from "lucide-react";

import { useTarefasStore } from "../../estado/tarefasStore";
import type { Secao } from "../../tarefas/tipos";

interface Props {
  secao: Secao;
  hoje: string;
}

export default function NovaTarefaInline({ secao, hoje }: Props) {
  const criar = useTarefasStore((s) => s.criar);
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState("");
  const encerrarNoBlur = useRef(true);

  function abrir() {
    setValor("");
    encerrarNoBlur.current = true;
    setEditando(true);
  }

  function confirmarECadear() {
    const t = valor.trim();
    if (!t) {
      setEditando(false);
      return;
    }
    criar(secao, t, hoje);
    setValor("");
    // segue na cadeia: o input continua aberto e focado
  }

  function aoTeclar(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!valor.trim()) {
        encerrarNoBlur.current = false;
        setEditando(false);
        return;
      }
      confirmarECadear();
    } else if (e.key === "Escape") {
      e.preventDefault();
      encerrarNoBlur.current = false;
      setValor("");
      setEditando(false);
    }
  }

  function aoBlur() {
    if (!encerrarNoBlur.current) {
      encerrarNoBlur.current = true;
      return;
    }
    const t = valor.trim();
    if (t) criar(secao, t, hoje);
    setValor("");
    setEditando(false);
  }

  if (!editando) {
    return (
      <button
        type="button"
        onClick={abrir}
        className="mt-1 flex items-center gap-1.5 rounded-controle px-1 py-1 text-[12px] text-tinta-suave hover:bg-lavagem hover:text-tinta"
      >
        <Plus size={14} strokeWidth={1.5} />
        Nova tarefa
      </button>
    );
  }

  return (
    <input
      autoFocus
      value={valor}
      onChange={(e) => setValor(e.target.value)}
      onKeyDown={aoTeclar}
      onBlur={aoBlur}
      placeholder="Escreva o título e tecle Enter"
      className="mt-1 w-full rounded-controle border border-regua-forte bg-papel px-2 py-1 text-[13px] text-tinta placeholder:text-tinta-suave focus:border-musgo focus:outline-none"
    />
  );
}
