// Aba do dockview: nome + indicador de não salvo + botão de fechar (doc 06 / doc 04 §1).
// O ponto ao lado do nome: `ocre` sujo, pulsando ao salvar, `bordo` no erro.

import { X } from "lucide-react";
import type { IDockviewPanelHeaderProps } from "dockview";

import { useDocumentosStore, type EstadoDoc } from "../estado/documentosStore";

function corDoPonto(estado: EstadoDoc | undefined): string | null {
  if (estado === "editando" || estado === "salvando") return "var(--color-ocre)";
  if (estado === "erro") return "var(--color-bordo)";
  return null;
}

export default function AbaDocumento(props: IDockviewPanelHeaderProps) {
  const path = (props.params as { path?: string }).path;
  const estado = useDocumentosStore((s) =>
    path ? s.docs.get(path)?.estado : undefined,
  );
  const cor = corDoPonto(estado);

  return (
    <div className="flex h-full items-center gap-2 px-3 text-[13px] text-tinta-media">
      {cor && (
        <span
          className={`h-[6px] w-[6px] shrink-0 rounded-full ${
            estado === "salvando" ? "animate-pulse" : ""
          }`}
          style={{ backgroundColor: cor }}
        />
      )}
      <span className="truncate">{props.api.title}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          props.api.close();
        }}
        className="ml-1 grid h-4 w-4 shrink-0 place-items-center rounded-controle text-tinta-suave hover:bg-lavagem hover:text-tinta"
        title="Fechar aba"
      >
        <X size={12} strokeWidth={2} />
      </button>
    </div>
  );
}
