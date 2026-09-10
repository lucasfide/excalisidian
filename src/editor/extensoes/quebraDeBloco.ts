// Enter em parágrafo/heading solto grava uma quebra de linha simples (`\n`); apertar Enter de
// novo numa linha vazia é que abre a linha em branco = bloco novo no Markdown (doc 04 §3.2,
// doc 09 ADR-18 — reversão parcial: antes o primeiro Enter já gravava `\n\n`). Shift+Enter
// também quebra dentro do mesmo bloco, repetindo o prefixo de continuação de lista/citação.
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

  view.dispatch({
    changes: { from: sel.from, insert: "\n" },
    selection: EditorSelection.cursor(sel.from + 1),
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
