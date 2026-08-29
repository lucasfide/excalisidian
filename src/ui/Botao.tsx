// Botão do design system (doc 06, tabela de variantes). Quatro variantes, duas alturas.
// Estados obrigatórios do doc: repouso, hover, foco visível, ativo, desabilitado, carregando.
// O anel de foco vem do `:focus-visible` global de `globals.css` (2px `musgo`, offset 2px).

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2, type LucideIcon } from "lucide-react";

import { cn } from "./cn";

export type VarianteBotao =
  | "primario"
  | "secundario"
  | "fantasma"
  | "destrutivo";
export type TamanhoBotao = "padrao" | "compacto";

const VARIANTES: Record<VarianteBotao, string> = {
  primario: "bg-musgo text-superficie hover:bg-musgo/90",
  secundario:
    "border border-regua-forte bg-transparent text-tinta hover:bg-lavagem",
  fantasma: "bg-transparent text-tinta-media hover:bg-lavagem hover:text-tinta",
  destrutivo:
    "border border-bordo bg-transparent text-bordo hover:bg-bordo hover:text-superficie",
};

const TAMANHOS: Record<TamanhoBotao, string> = {
  padrao: "h-9 gap-2 px-4 text-corpo",
  compacto: "h-[30px] gap-1.5 px-3 text-pequeno",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBotao;
  tamanho?: TamanhoBotao;
  /** Troca o ícone por um spinner e desabilita o botão. */
  carregando?: boolean;
  Icone?: LucideIcon;
  children?: ReactNode;
}

export default function Botao({
  variante = "secundario",
  tamanho = "padrao",
  carregando = false,
  Icone,
  className,
  disabled,
  children,
  ...resto
}: Props) {
  const IconeAtual = carregando ? Loader2 : Icone;
  return (
    <button
      {...resto}
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-controle",
        "transition-colors duration-[140ms] ease-caderno",
        "disabled:pointer-events-none disabled:opacity-50",
        VARIANTES[variante],
        TAMANHOS[tamanho],
        className,
      )}
    >
      {IconeAtual && (
        <IconeAtual
          size={16}
          strokeWidth={1.5}
          className={cn("shrink-0", carregando && "animate-spin")}
          aria-hidden
        />
      )}
      {children}
    </button>
  );
}
