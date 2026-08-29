// Menu de contexto (doc 06: `ContextMenu` do inventário base). Superfície flutuante
// posicionada por coordenada de tela, fechando em clique fora, Esc ou perda de foco da janela.
// Ícone de 16px em linha de menu, traço 1.5 (doc 06, seção Ícones).

import { useEffect, useRef, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "./cn";
import Superficie from "./Superficie";

export interface PosicaoMenu {
  x: number;
  y: number;
}

interface PropsMenu {
  posicao: PosicaoMenu;
  onFechar: () => void;
  children: ReactNode;
}

export function Menu({ posicao, onFechar, children }: PropsMenu) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const aoClicarFora = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onFechar();
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onFechar();
      }
    };
    window.addEventListener("mousedown", aoClicarFora);
    window.addEventListener("keydown", aoTeclar, true);
    window.addEventListener("blur", onFechar);
    return () => {
      window.removeEventListener("mousedown", aoClicarFora);
      window.removeEventListener("keydown", aoTeclar, true);
      window.removeEventListener("blur", onFechar);
    };
  }, [onFechar]);

  return (
    <Superficie
      ref={ref}
      flutuante
      role="menu"
      className="fixed z-50 min-w-[180px] py-1"
      style={{ left: posicao.x, top: posicao.y }}
    >
      {children}
    </Superficie>
  );
}

interface PropsItem {
  Icone?: LucideIcon;
  rotulo: string;
  onClick: () => void;
  destrutivo?: boolean;
  desabilitado?: boolean;
}

export function ItemMenu({
  Icone,
  rotulo,
  onClick,
  destrutivo = false,
  desabilitado = false,
}: PropsItem) {
  return (
    <button
      role="menuitem"
      disabled={desabilitado}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px]",
        "transition-colors duration-[140ms] ease-caderno",
        "disabled:pointer-events-none disabled:opacity-50",
        destrutivo
          ? "text-bordo hover:bg-bordo hover:text-superficie"
          : "text-tinta hover:bg-lavagem",
      )}
    >
      {Icone && (
        <Icone
          size={16}
          strokeWidth={1.5}
          className={cn("shrink-0", !destrutivo && "text-tinta-media")}
          aria-hidden
        />
      )}
      {rotulo}
    </button>
  );
}

export function SeparadorMenu() {
  return <div role="separator" className="my-1 h-px bg-regua" />;
}
