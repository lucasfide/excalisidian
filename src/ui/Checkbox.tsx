// Checkbox do design system (doc 06 — inventário de base). Controlado, sem <input>: um
// <button role="checkbox"> pra estilizar 100% com tokens.

import { Check } from "lucide-react";
import { cn } from "./cn";

interface Props {
  checked: boolean;
  onChange: (proximo: boolean) => void;
  /** Rótulo acessível — a linha não tem texto próprio no botão. */
  rotulo: string;
  className?: string;
}

export default function Checkbox({ checked, onChange, rotulo, className }: Props) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={rotulo}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded-controle border transition-colors duration-[140ms]",
        checked
          ? "border-musgo bg-musgo text-superficie"
          : "border-regua-forte text-transparent hover:border-tinta-suave",
        className,
      )}
    >
      <Check size={12} strokeWidth={3} />
    </button>
  );
}
