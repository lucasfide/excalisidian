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

export function blocoEm(arvore: Tree, doc: Text, pos: number): Bloco | null {
  // `resolveInner(pos, -1)` (o padrão já usado em inline-preview.ts) prefere o nó que TERMINA
  // em `pos` — falha bem no primeiro caractere de um bloco (a posição não termina nada ainda).
  // Tenta o lado oposto como plano B antes de desistir.
  return acharSubindo(arvore, pos, -1, doc) ?? acharSubindo(arvore, pos, 1, doc);
}

/**
 * Blocos irmãos de `bloco` — mesmo nível: filhos diretos de `Document`, ou os `ListItem` da
 * mesma lista quando `bloco` é um item. Usado por moverBloco.ts pra restringir mover a "trocar
 * de posição entre irmãos", nunca reindentar pra dentro/fora de uma lista.
 */
export function blocosIrmaos(arvore: Tree, doc: Text, bloco: Bloco): Bloco[] {
  const alvo = arvore.resolveInner(bloco.de, 1);
  let node: SyntaxNode | null = alvo;
  // Sobe até achar o nó cujo `.from === bloco.de` no nível certo (mesmo critério de blocoEm).
  while (node && !(node.from === bloco.de && (node.name === bloco.tipo))) {
    node = node.parent;
  }
  const pai = node?.parent;
  if (!pai) return bloco.tipo === "ListItem" ? [] : [bloco];

  const irmaos: Bloco[] = [];
  for (let filho = pai.firstChild; filho; filho = filho.nextSibling) {
    if (bloco.tipo === "ListItem" && filho.name !== "ListItem") continue;
    if (bloco.tipo !== "ListItem" && filho.name === "ListItem") continue;
    irmaos.push(construirBloco(doc, filho));
  }
  return irmaos;
}
