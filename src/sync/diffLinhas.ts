// src/sync/diffLinhas.ts
// Comparação linha a linha por subsequência comum mais longa. Sem biblioteca: cabe aqui,
// é testado, e uma dependência a mais num app local-first custa mais do que vale.
//
// "removido" = só existe no texto da esquerda. "adicionado" = só no da direita.
// CRLF é normalizado antes de comparar: o mesmo arquivo vindo de um Windows e de um Mac
// não é um conflito de conteúdo.
//
// A tabela de LCS é O(n×m) em tempo e em memória. Duas versões de uma nota grande diferem
// tipicamente em poucos lugares, então cortamos o prefixo e o sufixo comuns antes de montar
// a tabela — só o miolo realmente diferente entra nela. Isso reduz a tabela de milhões de
// células para poucas dezenas no caso comum. Mesmo assim, um miolo grande e completamente
// diferente ainda pode estourar: o LIMITE_CELULAS abaixo evita travar a interface nesse
// caso raro, trocando o destaque linha a linha por um bloco "removido" + "adicionado".

export type TipoTrecho = "igual" | "adicionado" | "removido";

export interface Trecho {
  tipo: TipoTrecho;
  linhas: string[];
}

/** Cerca de 2.000 × 2.000 linhas — dezenas de MB de tabela no pior caso. Acima disso, a
 * comparação linha a linha do miolo é trocada por um bloco removido+adicionado inteiro. */
const LIMITE_CELULAS = 4_000_000;

function emLinhas(texto: string): string[] {
  if (texto === "") return [];
  return texto.replace(/\r\n/g, "\n").split("\n");
}

/** Subsequência comum mais longa clássica, só para o trecho (miolo) já recortado. */
function diffMiolo(a: string[], b: string[]): Trecho[] {
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

export function diffLinhas(antes: string, depois: string): Trecho[] {
  const a = emLinhas(antes);
  const b = emLinhas(depois);

  // Corta o prefixo comum: enquanto as linhas do começo forem iguais, viram trecho "igual"
  // direto, sem entrar na tabela.
  let inicio = 0;
  const limiteInicio = Math.min(a.length, b.length);
  while (inicio < limiteInicio && a[inicio] === b[inicio]) inicio++;

  // Corta o sufixo comum, sem deixar o corte do fim se cruzar com o do começo.
  let fimA = a.length;
  let fimB = b.length;
  while (fimA > inicio && fimB > inicio && a[fimA - 1] === b[fimB - 1]) {
    fimA--;
    fimB--;
  }

  const prefixo = a.slice(0, inicio);
  const meioA = a.slice(inicio, fimA);
  const meioB = b.slice(inicio, fimB);
  const sufixo = a.slice(fimA);

  let miolo: Trecho[];
  if (meioA.length * meioB.length > LIMITE_CELULAS) {
    // Miolo grande demais para montar a tabela sem travar a interface: vira um bloco só,
    // sem destaque linha a linha.
    miolo = [];
    if (meioA.length > 0) miolo.push({ tipo: "removido", linhas: meioA });
    if (meioB.length > 0) miolo.push({ tipo: "adicionado", linhas: meioB });
  } else {
    miolo = diffMiolo(meioA, meioB);
  }

  const trechos: Trecho[] = [];
  if (prefixo.length > 0) trechos.push({ tipo: "igual", linhas: prefixo });
  trechos.push(...miolo);
  if (sufixo.length > 0) trechos.push({ tipo: "igual", linhas: sufixo });

  return trechos;
}

export function temDiferenca(trechos: Trecho[]): boolean {
  return trechos.some((t) => t.tipo !== "igual");
}
