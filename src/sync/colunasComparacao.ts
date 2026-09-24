// src/sync/colunasComparacao.ts
// Transforma o resultado de `diffLinhas` em duas colunas alinhadas, linha a linha, para o
// comparador lado a lado (`ComparadorNotas.tsx`). Pura de propósito — o componente só desenha
// (ver comentário de topo de `diffLinhas.ts` sobre o mesmo princípio).
//
// Uma linha "igual" aparece, sem marcação, nas duas colunas.
//
// Quando um trecho "removido" vem IMEDIATAMENTE seguido de um "adicionado" — o caso comum de
// "o usuário mudou esta linha" —, os dois são PAREADOS: a primeira linha removida ao lado da
// primeira adicionada, a segunda ao lado da segunda, e assim por diante, em `max(N, M)` linhas
// da grade. Sem isso, quem editou "linha um" via a versão antiga numa linha e a nova na linha
// DE BAIXO — o objetivo desta tela é comparar lado a lado, não empilhar. O lado mais curto do
// par é completado com uma célula em branco (revisão 1 do planejador, 2026-09-23).
//
// Um "removido" sem "adicionado" logo depois continua só na esquerda (a direita fica em
// branco); um "adicionado" sem "removido" antes continua só na direita. Isso é o mesmo caso do
// pareamento com o lado que falta vazio (0 linhas) — por isso o laço abaixo trata os dois com o
// mesmo código.

import type { Trecho } from "./diffLinhas";

export interface CelulaComparacao {
  texto: string | null;
  /** True quando esta célula faz parte da diferença (removida ou adicionada) — o componente
   * usa isto para decidir o fundo translúcido. Uma célula "igual" ou em branco nunca marca. */
  marcada: boolean;
  /** True SÓ na célula de PREENCHIMENTO de alinhamento (o lado mais curto de um par
   * removido/adicionado, completado pra as duas colunas terem o mesmo número de linhas na
   * grade — ver comentário de topo do arquivo). Uma linha vazia de verdade do arquivo (uma
   * linha "igual" com `texto === ""`) tem `preenchimento: false`: ela existe no conteúdo, o
   * preenchimento não. Sem esta distinção o dono do produto via as duas do mesmo jeito na
   * tela e achava que o arquivo tinha uma linha em branco que não existe (achado 23/09). */
  preenchimento: boolean;
}

export interface LinhaComparacao {
  esquerda: CelulaComparacao;
  direita: CelulaComparacao;
}

const CELULA_VAZIA: CelulaComparacao = { texto: null, marcada: false, preenchimento: true };

export function colunasDeComparacao(trechos: Trecho[]): LinhaComparacao[] {
  const linhas: LinhaComparacao[] = [];
  let i = 0;

  while (i < trechos.length) {
    const trecho = trechos[i];

    if (trecho.tipo === "igual") {
      for (const linha of trecho.linhas) {
        linhas.push({
          esquerda: { texto: linha, marcada: false, preenchimento: false },
          direita: { texto: linha, marcada: false, preenchimento: false },
        });
      }
      i++;
      continue;
    }

    if (trecho.tipo === "removido") {
      // Trecho seguinte é "adicionado"? Pareia os dois. Senão, o lado direito fica vazio em
      // toda linha — mesma fórmula, só que com 0 linhas adicionadas.
      const proximo = trechos[i + 1];
      const adicionadas = proximo?.tipo === "adicionado" ? proximo.linhas : [];
      const removidas = trecho.linhas;
      const total = Math.max(removidas.length, adicionadas.length);
      for (let k = 0; k < total; k++) {
        linhas.push({
          esquerda:
            k < removidas.length
              ? { texto: removidas[k], marcada: true, preenchimento: false }
              : CELULA_VAZIA,
          direita:
            k < adicionadas.length
              ? { texto: adicionadas[k], marcada: true, preenchimento: false }
              : CELULA_VAZIA,
        });
      }
      // Se pareou, o trecho "adicionado" seguinte já foi consumido — pula os dois.
      i += adicionadas.length > 0 ? 2 : 1;
      continue;
    }

    // "adicionado" que chegou aqui não foi consumido por um "removido" anterior (não havia um,
    // ou o anterior já era outra coisa): fica isolado, só na direita.
    for (const linha of trecho.linhas) {
      linhas.push({
        esquerda: CELULA_VAZIA,
        direita: { texto: linha, marcada: true, preenchimento: false },
      });
    }
    i++;
  }

  return linhas;
}
