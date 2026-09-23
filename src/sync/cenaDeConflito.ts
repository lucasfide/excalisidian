// src/sync/cenaDeConflito.ts
// Leitura da cena de UMA versão de um desenho em conflito, para o comparador visual
// (ComparadorDesenhos, task-6). Reusa o parser de `.draw.md` que `src/canvas/` já usa — não é
// um leitor novo, só decide o que fazer quando `parseDesenho` marca a cena como inválida
// (JSON corrompido pela sincronização): aquela coluna não abre, mas o arquivo continua no
// disco e "Manter as duas" continua disponível (doc 04 — nada é apagado antes da escolha).
//
// Módulo puro e testado (decisão do planejador, revisão da task-6): o componente só chama
// isto e desenha o resultado, sem lógica de "abriu ou não" dentro do JSX.

import { parseDesenho, type CenaDesenho } from "../canvas/formatoDesenho";

export type LeituraCenaConflito = { ok: true; cena: CenaDesenho } | { ok: false };

export function lerCenaDeConflito(conteudo: string): LeituraCenaConflito {
  try {
    const dados = parseDesenho(conteudo);
    if (dados.cenaInvalida) return { ok: false };
    return { ok: true, cena: dados.cena };
  } catch {
    // `parseDesenho` já trata JSON quebrado internamente (retorna cenaInvalida), mas uma
    // versão sincronizada pode chegar corrompida de formas que nem chegam a essa validação
    // (ex.: frontmatter YAML inválido) — defesa em profundidade, nunca deixa escapar.
    return { ok: false };
  }
}
