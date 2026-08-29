// Select nativo com a aparência de controle do design system (doc 06: borda `regua-forte`,
// `raio-controle`). Nativo de propósito: o menu do sistema é acessível de graça e não há
// requisito de opção customizada.

import type { SelectHTMLAttributes } from "react";

import { cn } from "./cn";

export interface OpcaoSelect {
  rotulo: string;
  valor: string;
}

interface Props extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  opcoes: ReadonlyArray<OpcaoSelect>;
  /** Rótulo acessível quando não há `<label>` visível ao lado. */
  rotulo: string;
  compacto?: boolean;
}

export default function Select({
  opcoes,
  rotulo,
  compacto = false,
  className,
  ...resto
}: Props) {
  return (
    <select
      {...resto}
      title={rotulo}
      aria-label={rotulo}
      className={cn(
        "rounded-controle border border-regua-forte bg-superficie text-tinta",
        "transition-colors duration-[140ms] ease-caderno",
        "disabled:pointer-events-none disabled:opacity-50",
        compacto ? "px-1 py-[2px] text-[11px]" : "h-[30px] px-2 text-pequeno",
        className,
      )}
    >
      {opcoes.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.rotulo}
        </option>
      ))}
    </select>
  );
}
