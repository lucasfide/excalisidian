// Decisão pura de onde um arrasto na árvore de arquivos cai: qual linha está sob o cursor, se
// isso vira reordenar (mesmo nível) ou mover (pra dentro de outra pasta), e onde desenhar o
// indicador. Nada de React, DOM ou store aqui — só geometria e as regras da tabela de
// comportamento do plano de arrasto (doc do plano, "Comportamento").

export interface LinhaGeometria {
  /** "no" = arquivo ou pasta; "separador" = linha divisória da raiz. */
  tipo: "no" | "separador";
  /** Nó: nome-base (ex. "Nota.md"). Separador: o id `sep-xxxxxx`. É a entrada que vai pro customOrder. */
  chave: string;
  /** Nó: caminho relativo (ex. "Projetos/Nota.md"). Separador: o próprio id. */
  path: string;
  /** Pasta que contém a linha: pastaDe(path) pra nó, "" pra separador. */
  pasta: string;
  ehPasta: boolean;
  /** Profundidade (0 = raiz). Separador é 0. */
  nivel: number;
  inicio: number;
  altura: number;
}

export type ItemArrastado =
  | { tipo: "no"; chave: string; path: string; pasta: string; ehPasta: boolean }
  | { tipo: "separador"; chave: string };

export type AlvoSoltura =
  | {
      tipo: "reordenar";
      /** Nível que muda de ordem ("" = raiz). */
      pasta: string;
      /** Entrada antes da qual o item entra; null = fim do nível. */
      antesDe: string | null;
      /** Onde desenhar o indicador (coordenada de conteúdo, a fronteira entre linhas). */
      y: number;
      /** Recuo do indicador. */
      nivel: number;
    }
  | { tipo: "mover"; pasta: string }
  | null;

export interface ContextoSoltura {
  linhas: LinhaGeometria[];
  /** y do ponteiro no conteúdo (já com scrollTop). */
  y: number;
  item: ItemArrastado;
  modo: "custom" | "alphabetical";
  /** Soma das alturas das linhas (fim da árvore). */
  alturaArvore: number;
  /** Altura da faixa "raiz do vault", desenhada logo abaixo da árvore só durante arrasto de arquivo. */
  alturaFaixaRaiz: number;
}

/** Ordem nova de um nível: tira `arrastado` de `base` e reinsere antes de `antesDe` (null = no
 * fim). Devolve null se `antesDe` não está em `base`, se `antesDe === arrastado` (some de
 * `base` junto com `arrastado`, logo nunca é achado) ou se a ordem não muda. Não muta `base`. */
export function calcularNovaOrdem(
  base: string[],
  arrastado: string,
  antesDe: string | null,
): string[] | null {
  const semArrastado = base.filter((e) => e !== arrastado);
  const indice = antesDe === null ? semArrastado.length : semArrastado.indexOf(antesDe);
  if (antesDe !== null && indice === -1) return null;
  const novaOrdem = [...semArrastado.slice(0, indice), arrastado, ...semArrastado.slice(indice)];
  if (novaOrdem.length === base.length && novaOrdem.every((e, i) => e === base[i])) return null;
  return novaOrdem;
}

/** Índice, em `linhas`, da primeira linha depois de `indice` que NÃO é descendente dela (pasta
 * fechada ou sem filhos visíveis: o bloco é só a própria linha). */
function indiceFimDoBloco(linhas: LinhaGeometria[], indice: number): number {
  const alvo = linhas[indice];
  const prefixo = alvo.path + "/";
  let i = indice + 1;
  while (i < linhas.length && linhas[i].path.startsWith(prefixo)) i++;
  return i;
}

/** Tenta reordenar `alvoPasta` pondo `item.chave` antes de `antesDe` (null = fim). Devolve null
 * se isso não muda nada (sem efeito = sem indicador). */
function tentarReordenar(
  linhas: LinhaGeometria[],
  alvoPasta: string,
  nivel: number,
  chaveItem: string,
  antesDe: string | null,
  y: number,
): AlvoSoltura {
  const base = linhas.filter((l) => l.pasta === alvoPasta).map((l) => l.chave);
  const novaOrdem = calcularNovaOrdem(base, chaveItem, antesDe);
  if (novaOrdem === null) return null;
  return { tipo: "reordenar", pasta: alvoPasta, antesDe, y, nivel };
}

/** "Antes de L": indicador em L.inicio, entrada antesDe = L.chave. */
function antesDeLinha(
  linhas: LinhaGeometria[],
  chaveItem: string,
  alvoPasta: string,
  L: LinhaGeometria,
): AlvoSoltura {
  return tentarReordenar(linhas, alvoPasta, L.nivel, chaveItem, L.chave, L.inicio);
}

/** "Depois de L": pula o bloco inteiro de L (ela mais os descendentes visíveis) e insere antes
 * da próxima entrada do mesmo nível — ou no fim do nível, se não houver próxima. */
function depoisDeLinha(
  linhas: LinhaGeometria[],
  chaveItem: string,
  alvoPasta: string,
  indiceL: number,
  alturaArvore: number,
): AlvoSoltura {
  const L = linhas[indiceL];
  const fimIdx = indiceFimDoBloco(linhas, indiceL);
  const proxima = fimIdx < linhas.length ? linhas[fimIdx] : undefined;
  const y = proxima ? proxima.inicio : alturaArvore;
  const antesDe = proxima && proxima.pasta === alvoPasta ? proxima.chave : null;
  return tentarReordenar(linhas, alvoPasta, L.nivel, chaveItem, antesDe, y);
}

/** Metade de cima de L: antes dela. Metade de baixo: depois do bloco dela. */
function metadeLinha(
  ctx: ContextoSoltura,
  chaveItem: string,
  alvoPasta: string,
  L: LinhaGeometria,
  indiceL: number,
): AlvoSoltura {
  const frac = (ctx.y - L.inicio) / L.altura;
  if (frac < 0.5) return antesDeLinha(ctx.linhas, chaveItem, alvoPasta, L);
  return depoisDeLinha(ctx.linhas, chaveItem, alvoPasta, indiceL, ctx.alturaArvore);
}

/** 25% de cima: antes · 50% do meio: mover pra dentro · 25% de baixo: depois do bloco.
 * (Só usado quando L é pasta irmã do item e o item é arquivo — nunca produz "mover" pra pasta.) */
function tercoLinha(ctx: ContextoSoltura, chaveItem: string, L: LinhaGeometria, indiceL: number): AlvoSoltura {
  const frac = (ctx.y - L.inicio) / L.altura;
  if (frac < 0.25) return antesDeLinha(ctx.linhas, chaveItem, L.pasta, L);
  if (frac < 0.75) return { tipo: "mover", pasta: L.path };
  return depoisDeLinha(ctx.linhas, chaveItem, L.pasta, indiceL, ctx.alturaArvore);
}

/** Arrastando um arquivo ou pasta (item.tipo === "no"), cursor sobre a linha `linhas[indiceL]`. */
function calcularAlvoNo(
  ctx: ContextoSoltura,
  item: Extract<ItemArrastado, { tipo: "no" }>,
  indiceL: number,
): AlvoSoltura {
  const linhas = ctx.linhas;
  const L = linhas[indiceL];

  // A própria linha do item, ou qualquer descendente dele: nenhum alvo.
  if (L.path === item.path || L.path.startsWith(item.path + "/")) return null;

  if (L.tipo === "separador") {
    // Separador só é alvo válido se o item está na raiz, e só em modo customizado.
    if (item.pasta === "" && ctx.modo === "custom") {
      return metadeLinha(ctx, item.chave, "", L, indiceL);
    }
    return null;
  }

  const irma = L.pasta === item.pasta;

  if (L.ehPasta && L.path !== item.pasta) {
    if (ctx.modo === "custom" && irma) {
      if (!item.ehPasta) return tercoLinha(ctx, item.chave, L, indiceL);
      return metadeLinha(ctx, item.chave, L.pasta, L, indiceL);
    }
    // Não é irmã em modo customizado (ou modo alfabético): a pasta inteira é "mover pra
    // dentro", e só faz sentido pra item arquivo — pasta nunca muda de lugar no disco.
    if (!item.ehPasta) return { tipo: "mover", pasta: L.path };
    return null;
  }

  // L é arquivo (ou é a própria pasta que contém o item — nesse caso não é irmã e cai aqui
  // sem bater a condição acima, o que já deixa "sem efeito" por não sobrar nenhum ramo).
  if (!L.ehPasta && ctx.modo === "custom" && irma) {
    return metadeLinha(ctx, item.chave, L.pasta, L, indiceL);
  }
  return null;
}

/** Arrastando o separador (item.tipo === "separador"), cursor sobre a linha `linhas[indiceL]`. */
function calcularAlvoSeparador(
  ctx: ContextoSoltura,
  item: Extract<ItemArrastado, { tipo: "separador" }>,
  indiceL: number,
): AlvoSoltura {
  const linhas = ctx.linhas;
  // A linha sob o cursor pertence ao bloco de uma entrada da raiz: sobe até achar o
  // ancestral de nível 0 (a própria linha, se já for nível 0). `indiceDono > 0` é a rede de
  // segurança: entrada malformada (nível > 0 sem ancestral nível 0 antes dela) para no início
  // do array em vez de ler `linhas[-1]`.
  let indiceDono = indiceL;
  while (indiceDono > 0 && linhas[indiceDono].nivel !== 0) indiceDono--;
  const dono = linhas[indiceDono];
  const fimIdx = indiceFimDoBloco(linhas, indiceDono);
  const fimY = fimIdx < linhas.length ? linhas[fimIdx].inicio : ctx.alturaArvore;
  const frac = (ctx.y - dono.inicio) / (fimY - dono.inicio);
  if (frac < 0.5) return antesDeLinha(linhas, item.chave, "", dono);
  return depoisDeLinha(linhas, item.chave, "", indiceDono, ctx.alturaArvore);
}

/** Abaixo da última linha da árvore: faixa "raiz do vault" (só existe pra arrasto de arquivo)
 * e o espaço além dela. */
function calcularAlvoAbaixoDaArvore(ctx: ContextoSoltura): AlvoSoltura {
  const { item, modo, alturaArvore, alturaFaixaRaiz, y } = ctx;

  if (item.tipo === "separador") {
    return tentarReordenar(ctx.linhas, "", 0, item.chave, null, alturaArvore);
  }

  const dentroFaixa = y < alturaArvore + alturaFaixaRaiz;
  if (dentroFaixa && !item.ehPasta && item.pasta !== "") {
    return { tipo: "mover", pasta: "" };
  }
  if (item.pasta === "" && modo === "custom") {
    return tentarReordenar(ctx.linhas, "", 0, item.chave, null, alturaArvore);
  }
  return null;
}

export function calcularAlvo(ctx: ContextoSoltura): AlvoSoltura {
  const { linhas, y, item, alturaArvore } = ctx;

  if (y >= alturaArvore) {
    return calcularAlvoAbaixoDaArvore(ctx);
  }

  const indiceL = linhas.findIndex((l) => y >= l.inicio && y < l.inicio + l.altura);
  if (indiceL === -1) return null;

  const resultado =
    item.tipo === "no" ? calcularAlvoNo(ctx, item, indiceL) : calcularAlvoSeparador(ctx, item, indiceL);

  // Rede de segurança: pasta arrastada nunca vira "mover" (mover pasta no disco está fora do
  // escopo — ver src/vault/mover.ts).
  if (item.tipo === "no" && item.ehPasta && resultado?.tipo === "mover") return null;

  return resultado;
}
