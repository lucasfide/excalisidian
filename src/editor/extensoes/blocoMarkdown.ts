// Modelo de "bloco" do editor de nota (doc 09 ADR-18): a base do clique triplo
// (selecaoDeBloco.ts), do Enter/Shift+Enter (quebraDeBloco.ts) e de mover bloco (moverBloco.ts).
//
// Markdown não tem bloco como objeto — o que existe é a árvore de sintaxe do lezer, já
// disponível no editor (`markdown({ base: markdownLanguage, ... })`, AtomicCodeMirrorEditor.tsx)
// e com padrão de uso estabelecido em inline-preview.ts (resolveInner + subida por `.parent`).
// Nada de regex própria: src/indice/sintaxe.ts é linha-a-linha e não enxerga parágrafo.
//
// Regra: o bloco é o filho direto de `Document` que contém a posição — Paragraph, ATXHeadingN,
// Blockquote, FencedCode, Table, HorizontalRule, BulletList/OrderedList inteiras — exceto
// dentro de lista, onde desce até o `ListItem` mais interno (cada item é seu próprio bloco,
// igual Notion — e é por isso que "título move só a linha", não a lista toda).
//
// Exceção do parágrafo solto: Enter grava `\n` simples, e pro Markdown linhas separadas por `\n`
// simples são UM parágrafo só. Mas pro usuário cada Enter abre um bloco novo; só o Shift+Enter
// junta linhas no mesmo bloco. O que distingue os dois no arquivo é o hard break do CommonMark:
// Shift+Enter grava dois espaços antes da quebra (`  \n`, quebraDeBloco.ts). Então, dentro de um
// `Paragraph` filho de `Document`, o bloco é a sequência de linhas ligadas por hard break — uma
// linha que termina em `  ` (ou `\`) puxa a de baixo pro mesmo bloco.
//
// Puro: recebe `Tree` + `Text`, nunca `EditorView` — testável em `environment: "node"` sem DOM
// (vitest.config.ts), construindo a árvore direto com markdownLanguage.parser.parse(texto).

import type { Tree, SyntaxNode } from "@lezer/common";
import type { Text } from "@codemirror/state";

export interface Bloco {
  de: number;
  /** Nunca inclui a quebra de linha final que separa este bloco do próximo. */
  ate: number;
  tipo: string;
}

function apararQuebraFinal(doc: Text, de: number, ate: number): number {
  let fim = ate;
  while (fim > de && doc.sliceString(fim - 1, fim) === "\n") fim--;
  return fim;
}

function construirBloco(doc: Text, node: SyntaxNode): Bloco {
  return { de: node.from, ate: apararQuebraFinal(doc, node.from, node.to), tipo: node.name };
}

/**
 * Acha o bloco que contém `pos`: o filho direto de `Document`, ou o `ListItem` mais interno
 * se `pos` estiver dentro de uma lista. `null` se `pos` não estiver dentro de bloco nenhum
 * (linha em branco entre blocos, início/fim do documento vazio).
 */
function acharSubindo(arvore: Tree, pos: number, lado: -1 | 1, doc: Text): Bloco | null {
  let node: SyntaxNode | null = arvore.resolveInner(pos, lado);
  while (node) {
    if (node.name === "ListItem") return construirBloco(doc, node);
    const pai: SyntaxNode | null = node.parent;
    if (!pai) return null; // chegou na raiz (Document) sem achar filho — pos está "no vazio"
    if (pai.name === "Document") return construirBloco(doc, node);
    node = pai;
  }
  return null;
}

/** Linha que termina em hard break do CommonMark: dois ou mais espaços, ou barra invertida. */
export function terminaEmHardBreak(textoLinha: string): boolean {
  return / {2,}$|\\$/.test(textoLinha);
}

/**
 * Recorta, dentro de um parágrafo solto, só o grupo de linhas ligadas por hard break que contém
 * `pos` (ver o cabeçalho do arquivo). Parágrafo de uma linha só volta igual.
 */
function recortarGrupoDeLinhas(doc: Text, paragrafo: Bloco, pos: number): Bloco {
  const primeira = doc.lineAt(paragrafo.de).number;
  const ultima = doc.lineAt(paragrafo.ate).number;
  const alvo = Math.min(Math.max(doc.lineAt(pos).number, primeira), ultima);

  let inicio = alvo;
  while (inicio > primeira && terminaEmHardBreak(doc.line(inicio - 1).text)) inicio--;
  let fim = alvo;
  while (fim < ultima && terminaEmHardBreak(doc.line(fim).text)) fim++;

  const de = inicio === primeira ? paragrafo.de : doc.line(inicio).from;
  const ate = fim === ultima ? paragrafo.ate : doc.line(fim).to;
  return { de, ate, tipo: paragrafo.tipo };
}

/** Todos os grupos de linhas de um parágrafo solto, de cima pra baixo. */
function gruposDoParagrafo(doc: Text, paragrafo: Bloco): Bloco[] {
  const grupos: Bloco[] = [];
  let pos = paragrafo.de;
  for (;;) {
    const grupo = recortarGrupoDeLinhas(doc, paragrafo, pos);
    grupos.push(grupo);
    if (grupo.ate >= paragrafo.ate) return grupos;
    pos = doc.lineAt(grupo.ate).to + 1;
  }
}

export function blocoEm(arvore: Tree, doc: Text, pos: number): Bloco | null {
  // `resolveInner(pos, -1)` (o padrão já usado em inline-preview.ts) prefere o nó que TERMINA
  // em `pos` — falha bem no primeiro caractere de um bloco (a posição não termina nada ainda).
  // Tenta o lado oposto como plano B antes de desistir.
  const bloco = acharSubindo(arvore, pos, -1, doc) ?? acharSubindo(arvore, pos, 1, doc);
  if (bloco?.tipo === "Paragraph") return recortarGrupoDeLinhas(doc, bloco, pos);
  return bloco;
}

/**
 * Blocos irmãos de `bloco` — mesmo nível: filhos diretos de `Document` (cada parágrafo solto
 * aberto nos seus grupos de linhas), ou os `ListItem` da mesma lista quando `bloco` é um item.
 * Usado por moverBloco.ts pra restringir mover a "trocar de posição entre irmãos", nunca
 * reindentar pra dentro/fora de uma lista.
 */
export function blocosIrmaos(arvore: Tree, doc: Text, bloco: Bloco): Bloco[] {
  if (bloco.tipo !== "ListItem") {
    const irmaos: Bloco[] = [];
    for (let filho = arvore.topNode.firstChild; filho; filho = filho.nextSibling) {
      const b = construirBloco(doc, filho);
      if (b.tipo === "Paragraph") irmaos.push(...gruposDoParagrafo(doc, b));
      else irmaos.push(b);
    }
    return irmaos;
  }

  // Item de lista: sobe até o `ListItem` que começa em `bloco.de` e pega os itens da mesma lista.
  let node: SyntaxNode | null = arvore.resolveInner(bloco.de, 1);
  while (node && !(node.from === bloco.de && node.name === "ListItem")) node = node.parent;
  const pai = node?.parent;
  if (!pai) return [];

  const irmaos: Bloco[] = [];
  for (let filho = pai.firstChild; filho; filho = filho.nextSibling) {
    if (filho.name === "ListItem") irmaos.push(construirBloco(doc, filho));
  }
  return irmaos;
}
