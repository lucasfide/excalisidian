// src/sync/colunasComparacao.ts
// Transforma o resultado de `diffLinhas` em duas colunas alinhadas, linha a linha, para o
// comparador lado a lado (`ComparadorNotas.tsx`). Pura de propósito — o componente só desenha
// (ver comentário de topo de `diffLinhas.ts` sobre o mesmo princípio).
//
// Uma linha "igual" aparece nas duas colunas. "removido" só existia na esquerda (versão desta
// máquina): a direita fica em branco na mesma linha, pra não perder o alinhamento visual entre
// as duas colunas. "adicionado" é o espelho: só a direita tem texto.

import type { Trecho, TipoTrecho } from "./diffLinhas";

export interface LinhaComparacao {
  tipo: TipoTrecho;
  esquerda: string | null;
  direita: string | null;
}

export function colunasDeComparacao(trechos: Trecho[]): LinhaComparacao[] {
  const linhas: LinhaComparacao[] = [];
  for (const trecho of trechos) {
    for (const linha of trecho.linhas) {
      if (trecho.tipo === "igual") {
        linhas.push({ tipo: "igual", esquerda: linha, direita: linha });
      } else if (trecho.tipo === "removido") {
        linhas.push({ tipo: "removido", esquerda: linha, direita: null });
      } else {
        linhas.push({ tipo: "adicionado", esquerda: null, direita: linha });
      }
    }
  }
  return linhas;
}
