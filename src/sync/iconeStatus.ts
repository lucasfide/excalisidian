// src/sync/iconeStatus.ts
// Módulo PURO com o mapeamento `StatusSync` → ícone e cor do `IconeSincronizacao` no rodapé da
// sidebar (doc 06 "Ícone de sincronização no rodapé da sidebar", doc 17 §8, plano 10 Task 5).
// Só nomes/tokens — `IconeSincronizacao.tsx` é quem resolve o nome do ícone para o componente
// do `lucide-react` e o token de cor para a classe Tailwind.

import type { StatusSync } from "../estado/syncStore";

/** Nome do ícone (doc 06): `cloud-check`, `refresh-cw`, `cloud-off`, `pause`,
 * `alert-triangle` — os mesmos nomes do `lucide-react`, em kebab-case como o doc 06 escreve. */
export type NomeIconeSync =
  | "cloud-check"
  | "refresh-cw"
  | "cloud-off"
  | "pause"
  | "alert-triangle";

export function iconeDeStatusSync(status: StatusSync): NomeIconeSync {
  if (typeof status === "object") return "alert-triangle"; // erro que pede ação (doc 06)
  switch (status) {
    case "sincronizado":
      return "cloud-check";
    case "sincronizando":
      return "refresh-cw";
    case "sem-conexao":
      return "cloud-off";
    case "pausado":
      return "pause";
    case "desligado":
      // O ícone não aparece em "desligado" (doc 06: só quando o vault atual está
      // sincronizado) — `IconeSincronizacao` nunca chama isto nesse status; este ramo só
      // existe para o switch ser exaustivo. `cloud-check` é um padrão inofensivo.
      return "cloud-check";
  }
}

/** Token de cor (doc 06, tabela "Cor por estado" — só tokens que já existem em `globals.css`).
 * `"pausado"` usa a mesma cor de repouso (`tinta-media`) a 50% de opacidade, como o balão do
 * agente pausado (`BalaoAgente.tsx`) — por isso devolve o token junto com a flag `opacidade50`
 * em vez de inventar uma cor nova. */
export interface CorStatusSync {
  token: "tinta-media" | "ocre" | "bordo";
  opacidade50: boolean;
}

export function corDeStatusSync(status: StatusSync): CorStatusSync {
  if (typeof status === "object") return { token: "bordo", opacidade50: false };
  switch (status) {
    case "sincronizado":
    case "sincronizando":
    case "desligado":
      return { token: "tinta-media", opacidade50: false };
    case "sem-conexao":
      return { token: "ocre", opacidade50: false };
    case "pausado":
      return { token: "tinta-media", opacidade50: true };
  }
}
