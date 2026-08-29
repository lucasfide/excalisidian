// Aba do dockview: nome + indicador de não salvo + botão de fechar (doc 06 / doc 04 §1).
// O ponto ao lado do nome: `ocre` sujo, pulsando ao salvar, `bordo` no erro. A informação
// nunca é transmitida só por cor — o ponto existe além dela (doc 06, piso de qualidade).

import { X } from "lucide-react";
import type { IDockviewPanelHeaderProps } from "dockview";

import { useDocumentosStore, type EstadoDoc } from "../estado/documentosStore";
import { BotaoIcone } from "../ui";

function pontoDoEstado(
  estado: EstadoDoc | undefined,
): { cor: string; rotulo: string; pulsando: boolean } | null {
  if (estado === "editando") {
    return { cor: "var(--color-ocre)", rotulo: "não salvo", pulsando: false };
  }
  if (estado === "salvando") {
    return { cor: "var(--color-ocre)", rotulo: "salvando", pulsando: true };
  }
  if (estado === "erro") {
    return { cor: "var(--color-bordo)", rotulo: "erro ao salvar", pulsando: false };
  }
  if (estado === "conflito" || estado === "orfao") {
    return { cor: "var(--color-bordo)", rotulo: "mudou fora do app", pulsando: false };
  }
  return null;
}

export default function AbaDocumento(props: IDockviewPanelHeaderProps) {
  const path = (props.params as { path?: string }).path;
  const estado = useDocumentosStore((s) =>
    path ? s.docs.get(path)?.estado : undefined,
  );
  const ponto = pontoDoEstado(estado);

  return (
    <div className="flex h-full items-center gap-2 px-3 text-[13px] text-tinta-media">
      {ponto && (
        <span
          title={ponto.rotulo}
          aria-label={ponto.rotulo}
          className={`h-[6px] w-[6px] shrink-0 rounded-full ${
            ponto.pulsando ? "animate-pulse motion-reduce:animate-none" : ""
          }`}
          style={{ backgroundColor: ponto.cor }}
        />
      )}
      <span className="truncate">{props.api.title}</span>
      <BotaoIcone
        Icone={X}
        titulo="Fechar aba"
        tamanho={16}
        className="ml-1"
        onClick={(e) => {
          e.stopPropagation();
          props.api.close();
        }}
      />
    </div>
  );
}
