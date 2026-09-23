// src/sync/diffLinhas.ts
// Comparação linha a linha por subsequência comum mais longa. Sem biblioteca: cabe aqui,
// é testado, e uma dependência a mais num app local-first custa mais do que vale.
//
// "removido" = só existe no texto da esquerda. "adicionado" = só no da direita.
// CRLF é normalizado antes de comparar: o mesmo arquivo vindo de um Windows e de um Mac
// não é um conflito de conteúdo.

export type TipoTrecho = "igual" | "adicionado" | "removido";

export interface Trecho {
  tipo: TipoTrecho;
  linhas: string[];
}

function emLinhas(texto: string): string[] {
  if (texto === "") return [];
  return texto.replace(/\r\n/g, "\n").split("\n");
}

export function diffLinhas(antes: string, depois: string): Trecho[] {
  const a = emLinhas(antes);
  const b = emLinhas(depois);

  // tabela[i][j] = tamanho da maior subsequência comum de a[i..] e b[j..]
  const tabela: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      tabela[i][j] =
        a[i] === b[j] ? tabela[i + 1][j + 1] + 1 : Math.max(tabela[i + 1][j], tabela[i][j + 1]);
    }
  }

  const trechos: Trecho[] = [];
  const empurrar = (tipo: TipoTrecho, linha: string) => {
    const ultimo = trechos[trechos.length - 1];
    if (ultimo && ultimo.tipo === tipo) ultimo.linhas.push(linha);
    else trechos.push({ tipo, linhas: [linha] });
  };

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      empurrar("igual", a[i]);
      i++;
      j++;
    } else if (tabela[i + 1][j] >= tabela[i][j + 1]) {
      empurrar("removido", a[i]);
      i++;
    } else {
      empurrar("adicionado", b[j]);
      j++;
    }
  }
  while (i < a.length) empurrar("removido", a[i++]);
  while (j < b.length) empurrar("adicionado", b[j++]);

  return trechos;
}

export function temDiferenca(trechos: Trecho[]): boolean {
  return trechos.some((t) => t.tipo !== "igual");
}
