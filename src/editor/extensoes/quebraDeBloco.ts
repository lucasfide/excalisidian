// Enter em parágrafo/heading solto grava uma quebra de linha simples (`\n`); apertar Enter de
// novo numa linha vazia é que abre a linha em branco = bloco novo no Markdown (doc 04 §3.2,
// doc 09 ADR-18 — reversão parcial: antes o primeiro Enter já gravava `\n\n`). Mesmo sem linha
// em branco, a linha nova já é um bloco próprio pro editor (alça, clique triplo): ver
// blocoMarkdown.ts. Shift+Enter quebra dentro do mesmo bloco — em parágrafo solto grava o hard
// break do CommonMark (`  \n`); em lista/citação repete o prefixo de continuação.
//
// `enterQuebraBloco` continua explícito (não só o padrão do CodeMirror) e em `Prec.highest` —
// o mesmo nível que `insertTightListItem` (inline-preview.ts) — pra fixar "Enter = `\n`" em
// parágrafo/heading solto independentemente da evolução do keymap padrão. Não há disputa:
// `enterQuebraBloco` só age em `Paragraph`/heading soltos (filho direto de `Document`);
// `insertTightListItem` só age em `BulletList`; `insertNewlineContinueMarkup` só quando há
// contexto de markup ativo (lista/citação). Fora desses casos todos devolvem `false`.
//
// Shift+Enter nunca existia como tecla própria (sem `shift` no binding de Enter dos outros
// três) — esta é a primeira vez que o app reage a ela.

import { EditorSelection, Prec } from "@codemirror/state";
import { keymap, type Command } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";

import { blocoEm } from "./blocoMarkdown";

const TIPOS_QUEBRAVEIS = new Set([
  "Paragraph",
  "ATXHeading1",
  "ATXHeading2",
  "ATXHeading3",
  "ATXHeading4",
  "ATXHeading5",
  "ATXHeading6",
  "SetextHeading1",
  "SetextHeading2",
]);

const enterQuebraBloco: Command = (view) => {
  const sel = view.state.selection.main;
  if (!sel.empty) return false; // com trecho selecionado, deixa o padrão substituir o trecho

  const bloco = blocoEm(syntaxTree(view.state), view.state.doc, sel.from);
  // Sem bloco reconhecido (linha em branco) ou bloco que não é parágrafo/heading solto
  // (ListItem, Blockquote, FencedCode, Table, HorizontalRule): devolve pro comportamento de
  // sempre — é o que preserva a continuação de lista/citação/código.
  if (!bloco || !TIPOS_QUEBRAVEIS.has(bloco.tipo)) return false;

  // Enter abre bloco novo (blocoMarkdown.ts): a linha de cima não pode terminar em hard break,
  // senão o `  ` que o Shift+Enter deixou puxaria a linha nova pro mesmo bloco. Tira os espaços
  // colados no cursor dos dois lados — o que sobra à direita iria pro começo da linha nova.
  const { de, ate } = espacosEmVolta(view, sel.from);
  view.dispatch({
    changes: { from: de, to: ate, insert: "\n" },
    selection: EditorSelection.cursor(de + 1),
    scrollIntoView: true,
    userEvent: "input",
  });
  return true;
};

/** Faixa de espaços/tabs colados em `pos`, na mesma linha, dos dois lados. */
function espacosEmVolta(view: Parameters<Command>[0], pos: number): { de: number; ate: number } {
  const linha = view.state.doc.lineAt(pos);
  let de = pos;
  while (de > linha.from && /[ \t]/.test(linha.text[de - 1 - linha.from])) de--;
  let ate = pos;
  while (ate < linha.to && /[ \t]/.test(linha.text[ate - linha.from])) ate++;
  return { de, ate };
}

/** Hard break do CommonMark: dois espaços antes da quebra (doc 09 ADR-18, revisão de 18/09/2026). */
const HARD_BREAK = "  \n";

// Prefixo de continuação: espaço em branco líder + qualquer combinação de marcador de lista
// (com ou sem checkbox), lista numerada, ou citação — repetido, pra cobrir aninhamento
// ("> - item"). Parágrafo comum não bate em nada disso e o prefixo fica vazio.
const RE_PREFIXO_CONTINUACAO = /^(?:[ \t]*(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+\.\s+|>\s*))*/;

const shiftEnterQuebraLinha: Command = (view) => {
  const sel = view.state.selection.main;
  if (!sel.empty) return false;

  // Parágrafo solto: Shift+Enter junta a linha nova ao mesmo bloco gravando o hard break (`  \n`).
  // É o que diferencia no arquivo do Enter, que grava `\n` e abre bloco novo (blocoMarkdown.ts).
  const bloco = blocoEm(syntaxTree(view.state), view.state.doc, sel.from);
  if (bloco?.tipo === "Paragraph") {
    const { de, ate } = espacosEmVolta(view, sel.from);
    view.dispatch({
      changes: { from: de, to: ate, insert: HARD_BREAK },
      selection: EditorSelection.cursor(de + HARD_BREAK.length),
      scrollIntoView: true,
      userEvent: "input",
    });
    return true;
  }

  const linha = view.state.doc.lineAt(sel.from);
  const prefixo = RE_PREFIXO_CONTINUACAO.exec(linha.text)?.[0] ?? "";
  const insercao = "\n" + prefixo;

  view.dispatch({
    changes: { from: sel.from, insert: insercao },
    selection: EditorSelection.cursor(sel.from + insercao.length),
    scrollIntoView: true,
    userEvent: "input",
  });
  return true;
};

/** Teclas deste keymap — lidas pelo teste de deriva do glossário (catalogoAtalhos.test.ts). */
export const TECLAS_QUEBRA_DE_BLOCO: readonly string[] = ["Enter", "Shift-Enter"];

export const quebraDeBloco = Prec.highest(
  keymap.of([
    { key: "Enter", run: enterQuebraBloco },
    { key: "Shift-Enter", run: shiftEnterQuebraLinha },
  ]),
);
