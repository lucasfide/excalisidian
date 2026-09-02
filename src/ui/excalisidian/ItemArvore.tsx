// Linha da árvore de arquivos (doc 06, inventário: `ItemArvore`). Recuo de 16px por nível;
// o nível ativo ganha uma hairline vertical de 2px em `musgo` — a régua de margem em
// miniatura. Cada nível de ancestral aberto ganha também uma linha guia de 1px em `regua`,
// pra ficar visível qual pasta contém o quê (doc 06, "Na sidebar").

import type { CSSProperties } from "react";

import { cn, IconeArquivo } from "../index";
import { nomeExibicao, type NoArvore } from "../../vault/arvore";

interface Props {
  no: NoArvore;
  nivel: number;
  aberta: boolean;
  /** Arquivo aberto na aba ativa. */
  destacado: boolean;
  /** Pasta sob o cursor durante um arrastar (destino do drop). */
  alvoDeArrasto?: boolean;
  style: CSSProperties;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onPointerDown?: (e: React.PointerEvent) => void;
}

export default function ItemArvore({
  no,
  nivel,
  aberta,
  destacado,
  alvoDeArrasto = false,
  style,
  onClick,
  onContextMenu,
  onPointerDown,
}: Props) {
  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDown}
      aria-current={destacado || undefined}
      className={cn(
        "absolute left-0 flex w-full items-center gap-2 py-1 pr-2 text-left text-[13px]",
        "transition-colors duration-[140ms] ease-caderno",
        destacado ? "bg-lavagem text-tinta" : "text-tinta-media hover:bg-lavagem",
        alvoDeArrasto &&
          "bg-[color-mix(in_srgb,var(--color-musgo)_12%,transparent)] outline outline-1 outline-musgo -outline-offset-1",
      )}
      style={{
        ...style,
        paddingLeft: 8 + nivel * 16,
        boxShadow: destacado ? "inset 2px 0 0 0 var(--color-musgo)" : undefined,
      }}
    >
      {Array.from({ length: nivel }, (_, d) => (
        <span
          key={d}
          aria-hidden
          className="absolute inset-y-0 w-px bg-regua"
          style={{ left: 8 + d * 16 + 7 }}
        />
      ))}
      <IconeArquivo
        tipo={no.tipo}
        aberta={aberta}
        className="shrink-0"
      />
      <span className="truncate" title={no.nome}>
        {nomeExibicao(no)}
      </span>
    </button>
  );
}
