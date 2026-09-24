// Diálogo modal (doc 06, inventário base). Superfície flutuante centrada — modal mantém
// `transform-origin: center` porque não está ancorado a um gatilho, ao contrário de popover.
//
// Comportamento: foco vai para o primeiro campo ao abrir e fica preso enquanto aberto, Esc e
// clique fora fecham, o foco volta para quem abriu. Entrada em 160ms com `--ease-caderno`
// (doc 06, tabela de movimento), respeitando `prefers-reduced-motion`.
//
// Renderiza por portal em document.body: qualquer ancestral com `transform` (mesmo
// `translateX(0)` residual de uma animação com `both`, como a da sidebar) vira bloco de
// contenção para descendentes `position: fixed`, e o `fixed inset-0` abaixo passaria a
// cobrir só esse ancestral em vez da janela inteira. O portal imuniza o Dialog contra
// isso hoje e contra qualquer ancestral parecido no futuro.

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { cn } from "./cn";
import Superficie from "./Superficie";

const FOCAVEIS =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

// Pilha de diálogos abertos na ordem de montagem. Dois Dialogos podem conviver (ex.:
// Configurações + assistente do agente por cima), e o handler de Esc de cada um só
// fecha o topo — senão um Esc fechava os dois de uma vez.
const fila: number[] = [];
let proximoId = 1;

interface Props {
  titulo: string;
  descricao?: string;
  onFechar: () => void;
  children?: ReactNode;
  /** Botões do rodapé. Convenção: cancelar à esquerda, confirmar à direita. */
  acoes?: ReactNode;
  className?: string;
  /** Diálogo "cru": a `Superficie` não recebe o padding padrão, e nada além de `children` é
   * renderizado dentro dela — sem `h2`, descrição ou rodapé de ações. Para diálogos que
   * desenham o próprio layout interno de ponta a ponta (ex.: `DialogoPreferencias`, com
   * navegação e cabeçalho próprios). `aria-label={titulo}` continua saindo, então o diálogo
   * tem nome acessível mesmo sem `h2` visível. */
  cru?: boolean;
}

export default function Dialog({
  titulo,
  descricao,
  onFechar,
  children,
  acoes,
  className,
  cru = false,
}: Props) {
  const caixaRef = useRef<HTMLDivElement | null>(null);
  const anteriorRef = useRef<HTMLElement | null>(null);
  const fecharRef = useRef(onFechar);
  fecharRef.current = onFechar;

  useEffect(() => {
    anteriorRef.current = document.activeElement as HTMLElement | null;
    const caixa = caixaRef.current;
    // Este efeito roda DEPOIS dos efeitos dos filhos (ordem de montagem React), então um filho
    // não consegue focar a si mesmo a tempo — o foco automático abaixo o atropelaria. Um filho
    // que precisa do foco inicial (ex.: a aba selecionada de `DialogoPreferencias`) marca o
    // elemento com `data-foco-inicial`, e é nele que o foco cai primeiro.
    const focoInicial = caixa?.querySelector<HTMLElement>("[data-foco-inicial]");
    (focoInicial ?? caixa?.querySelector<HTMLElement>(FOCAVEIS))?.focus();

    const id = proximoId++;
    fila.push(id);

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Só o diálogo do topo da pilha fecha — com a Configurações embaixo do
        // assistente, um Esc não pode fechar os dois.
        if (fila[fila.length - 1] !== id) return;
        e.preventDefault();
        e.stopPropagation();
        fecharRef.current();
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
      const i = fila.indexOf(id);
      if (i >= 0) fila.splice(i, 1);
      anteriorRef.current?.focus?.();
    };
    // Sem dependências: o efeito monta/desmonta UMA vez por diálogo aberto. O callback
    // de fechar é lido via ref — mudar a identidade dele no pai não deve re-empilhar.
  }, []);

  return createPortal(
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
          "w-full max-w-md",
          !cru && "p-5",
          "motion-safe:animate-[surgir_160ms_var(--ease-caderno)]",
          className,
        )}
      >
        {cru ? (
          children
        ) : (
          <>
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
          </>
        )}
      </Superficie>
    </div>,
    document.body,
  );
}
