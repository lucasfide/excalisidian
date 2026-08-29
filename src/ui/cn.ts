// Composição de classes do Tailwind. `clsx` junta e filtra condicionais; `twMerge` resolve
// conflitos (`px-4` sobrescrito por `px-2` vence o último, em vez de os dois valerem por
// ordem de declaração no CSS). É o que permite um componente aceitar `className` por prop
// sem que quem chama tenha que brigar com especificidade.

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...entradas: ClassValue[]): string {
  return twMerge(clsx(entradas));
}
