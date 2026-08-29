// Botão só de ícone (doc 06: alvo de 32×32 na toolbar; 16×16 no fecha-aba, que é um alvo
// secundário dentro de uma ficha). `titulo` é obrigatório: vira `title` e `aria-label`, para
// que o botão não fique sem nome acessível.

import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "./cn";

export type TamanhoBotaoIcone = 32 | 16;

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
  Icone: LucideIcon;
  titulo: string;
  tamanho?: TamanhoBotaoIcone;
  /** Ferramenta selecionada: fundo `musgo`, ícone em `superficie` (doc 06, toolbar). */
  ativo?: boolean;
}

export default function BotaoIcone({
  Icone,
  titulo,
  tamanho = 32,
  ativo = false,
  className,
  children,
  ...resto
}: Props) {
  const grande = tamanho === 32;
  return (
    <button
      {...resto}
      title={titulo}
      aria-label={titulo}
      aria-pressed={ativo || undefined}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-controle",
        "transition-colors duration-[140ms] ease-caderno",
        "disabled:pointer-events-none disabled:opacity-50",
        grande ? "h-8 w-8" : "h-4 w-4",
        ativo
          ? "bg-musgo text-superficie"
          : "text-tinta-media hover:bg-lavagem hover:text-tinta",
        className,
      )}
    >
      <Icone size={grande ? 18 : 12} strokeWidth={1.5} aria-hidden />
      {children}
    </button>
  );
}
