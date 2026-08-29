// Diálogo modal (doc 06, inventário base). Superfície flutuante centrada — modal mantém
// `transform-origin: center` porque não está ancorado a um gatilho, ao contrário de popover.
//
// Comportamento: foco vai para o primeiro campo ao abrir e fica preso enquanto aberto, Esc e
// clique fora fecham, o foco volta para quem abriu. Entrada em 160ms com `--ease-caderno`
// (doc 06, tabela de movimento), respeitando `prefers-reduced-motion`.

import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "./cn";
import Superficie from "./Superficie";

const FOCAVEIS =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

interface Props {
  titulo: string;
  descricao?: string;
  onFechar: () => void;
  children?: ReactNode;
  /** Botões do rodapé. Convenção: cancelar à esquerda, confirmar à direita. */
  acoes?: ReactNode;
  className?: string;
}

export default function Dialog({
  titulo,
  descricao,
  onFechar,
  children,
  acoes,
  className,
}: Props) {
  const caixaRef = useRef<HTMLDivElement | null>(null);
  const anteriorRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    anteriorRef.current = document.activeElement as HTMLElement | null;
    const caixa = caixaRef.current;
    caixa?.querySelector<HTMLElement>(FOCAVEIS)?.focus();

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onFechar();
        return;
      }
      if (e.key !== "Tab" || !caixa) return;
      // Prende o foco: Tab no último volta ao primeiro, Shift+Tab no primeiro vai ao último.
      const focaveis = [...caixa.querySelectorAll<HTMLElement>(FOCAVEIS)];
      if (focaveis.length === 0) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      } else if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      }
    };

    window.addEventListener("keydown", aoTeclar, true);
    return () => {
      window.removeEventListener("keydown", aoTeclar, true);
      anteriorRef.current?.focus?.();
    };
  }, [onFechar]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[color-mix(in_srgb,var(--color-tinta)_28%,transparent)] p-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <Superficie
        ref={caixaRef}
        flutuante
        role="dialog"
        aria-modal
        aria-label={titulo}
        className={cn(
          "w-full max-w-md p-5",
          "motion-safe:animate-[surgir_160ms_var(--ease-caderno)]",
          className,
        )}
      >
        <h2 className="font-display text-[19px] font-medium leading-[1.3] text-tinta">
          {titulo}
        </h2>
        {descricao && (
          <p className="mt-1 text-pequeno text-tinta-media [text-wrap:pretty]">
            {descricao}
          </p>
        )}
        {children && <div className="mt-4">{children}</div>}
        {acoes && <div className="mt-5 flex justify-end gap-2">{acoes}</div>}
      </Superficie>
    </div>
  );
}
