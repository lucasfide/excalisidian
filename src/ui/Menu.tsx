// Menu de contexto (doc 06: `ContextMenu` do inventário base). Superfície flutuante
// posicionada por coordenada de tela, fechando em clique fora, Esc ou perda de foco da janela.
// Ícone de 16px em linha de menu, traço 1.5 (doc 06, seção Ícones).

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, type LucideIcon } from "lucide-react";

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

  // Aberto perto da borda da janela, o menu vazaria pra fora: mede depois de montar e puxa
  // pra dentro. Antes do primeiro paint, então não pisca na posição errada.
  const [ajuste, setAjuste] = useState<PosicaoMenu>(posicao);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const margem = 8;
    setAjuste({
      x: Math.max(margem, Math.min(posicao.x, window.innerWidth - width - margem)),
      y: Math.max(margem, Math.min(posicao.y, window.innerHeight - height - margem)),
    });
  }, [posicao.x, posicao.y]);

  // Portal: `posicao` é coordenada de tela, e `fixed` só é relativo à tela se nenhum
  // ancestral tiver `transform` (a animação de entrada da sidebar deixa um aplicado) — dentro
  // dele o menu sairia deslocado e recortado na borda.
  return createPortal(
    <Superficie
      ref={ref}
      flutuante
      role="menu"
      className="fixed z-50 min-w-[180px] py-1"
      style={{ left: ajuste.x, top: ajuste.y }}
    >
      {children}
    </Superficie>,
    document.body,
  );
}

interface PropsItem {
  Icone?: LucideIcon;
  rotulo: string;
  onClick: () => void;
  destrutivo?: boolean;
  desabilitado?: boolean;
  /** Item de escolha única: sempre reserva o espaço do check, pra os rótulos do grupo
   * alinharem marcados ou não. Ignora `Icone`. */
  marcado?: boolean;
}

export function ItemMenu({
  Icone,
  rotulo,
  onClick,
  destrutivo = false,
  desabilitado = false,
  marcado,
}: PropsItem) {
  if (marcado !== undefined) {
    Icone = undefined;
  }
  return (
    <button
      role={marcado === undefined ? "menuitem" : "menuitemradio"}
      aria-checked={marcado}
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
      {marcado !== undefined && (
        <span className="inline-flex w-4 shrink-0 justify-center" aria-hidden>
          {marcado && <Check size={16} strokeWidth={1.5} className="text-tinta-media" />}
        </span>
      )}
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
