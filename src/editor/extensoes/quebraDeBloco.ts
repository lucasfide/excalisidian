// Enter cria um bloco novo (parágrafo separado por linha em branco); Shift+Enter quebra
// dentro do mesmo bloco (doc 09 ADR-18, doc 04). Hoje os dois fazem a mesma coisa — o
// CodeMirror liga Enter e Shift+Enter ao mesmo comando (`standardKeymap`:
// `{ key: "Enter", run: insertNewlineAndIndent, shift: insertNewlineAndIndent }`), então essa
// distinção precisa ser criada.
//
// Vai em `Prec.highest` — o mesmo nível que `insertTightListItem` (inline-preview.ts) usa pra
// vencer o keymap que a própria chamada `markdown({...})` instala por dentro
// (`addKeymap` é `true` por padrão). Não há disputa entre os dois: `enterQuebraBloco` só age
// em `Paragraph`/heading soltos (filho direto de `Document`); `insertTightListItem` só age em
// `BulletList`; `insertNewlineContinueMarkup` só quando há contexto de markup ativo (lista/
// citação). Fora desses casos, ambos devolvem `false` e quem sobra é o padrão de sempre.
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

  view.dispatch({
    changes: { from: sel.from, insert: "\n\n" },
    selection: EditorSelection.cursor(sel.from + 2),
    scrollIntoView: true,
    userEvent: "input",
  });
  return true;
};

// Prefixo de continuação: espaço em branco líder + qualquer combinação de marcador de lista
// (com ou sem checkbox), lista numerada, ou citação — repetido, pra cobrir aninhamento
// ("> - item"). Parágrafo comum não bate em nada disso e o prefixo fica vazio.
const RE_PREFIXO_CONTINUACAO = /^(?:[ \t]*(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+\.\s+|>\s*))*/;

const shiftEnterQuebraLinha: Command = (view) => {
  const sel = view.state.selection.main;
  if (!sel.empty) return false;

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

export const quebraDeBloco = Prec.highest(
  keymap.of([
    { key: "Enter", run: enterQuebraBloco },
    { key: "Shift-Enter", run: shiftEnterQuebraLinha },
  ]),
);
