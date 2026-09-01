// Composição de classes do Tailwind. `clsx` junta e filtra condicionais; `twMerge` resolve
// conflitos (`px-4` sobrescrito por `px-2` vence o último, em vez de os dois valerem por
// ordem de declaração no CSS). É o que permite um componente aceitar `className` por prop
// sem que quem chama tenha que brigar com especificidade.
//
// A escala tipográfica do doc 06 (`corpo`, `pequeno`) PRECISA ser declarada aqui. O
// tailwind-merge não lê o `@theme` do projeto: sem esta configuração ele classifica
// `text-corpo` como cor de texto (é a leitura ambígua de `text-*`) e, achando que conflita,
// **apaga a cor declarada antes** — o que quebrava o botão primário em silêncio:
// `cn("bg-musgo text-superficie", "... text-corpo")` devolvia sem `text-superficie`, o botão
// herdava `tinta` do body, e `tinta` sobre `musgo` dá 2,3:1 no claro e 2,2:1 no escuro (os
// dois temas ilegíveis, porque os dois tokens escurecem/clareiam juntos). Ver cn.test.ts.

import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["corpo", "pequeno"] }],
    },
  },
});

export function cn(...entradas: ClassValue[]): string {
  return twMerge(clsx(entradas));
}
