// Superfície do design system (doc 06). Regra dura do sistema: sombra existe em exatamente
// dois casos — elemento sendo arrastado e superfície flutuante (modal, popover, autocomplete,
// toolbar do canvas). Nenhuma superfície ancorada — sidebar, painel, aba, barra de status —
// tem sombra. Por isso as duas variantes.
//
// No tema escuro toda superfície flutuante leva também a hairline `regua`: a sombra sozinha
// não separa o suficiente (doc 06, seção de sombras).

import type { HTMLAttributes, Ref } from "react";

import { cn } from "./cn";

interface Props extends HTMLAttributes<HTMLDivElement> {
  /** Flutuante ganha `sombra-sobreposicao`; ancorada nunca tem sombra. */
  flutuante?: boolean;
  /** React 19: `ref` é uma prop normal, sem forwardRef. */
  ref?: Ref<HTMLDivElement>;
}

export default function Superficie({
  flutuante = false,
  className,
  children,
  ref,
  ...resto
}: Props) {
  return (
    <div
      {...resto}
      ref={ref}
      className={cn(
        "rounded-ficha border border-regua bg-superficie",
        flutuante && "shadow-sobreposicao",
        className,
      )}
    >
      {children}
    </div>
  );
}
