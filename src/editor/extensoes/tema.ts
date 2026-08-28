// Tema do CodeMirror com os tokens do design system. Usa as variáveis CSS diretamente, então
// segue a classe `.dark` no <html> sem um tema escuro separado. Fatia 1: só o essencial —
// tipografia, cursor e seleção. Live preview e a sintaxe em tinta-suave entram na Fatia 2.

import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

export const temaEditor = EditorView.theme({
  "&": {
    color: "var(--color-tinta)",
    backgroundColor: "transparent",
    fontSize: "15px",
  },
  ".cm-scroller": {
    fontFamily: "var(--fonte-sans)",
    lineHeight: "1.55",
    overflow: "auto",
  },
  ".cm-content": {
    caretColor: "var(--color-tinta)",
    padding: "0",
    maxWidth: "720px",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-line": { padding: "0" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--color-tinta)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
    {
      backgroundColor: "color-mix(in srgb, var(--color-musgo) 22%, transparent)",
    },
  ".cm-gutters": { display: "none" },
});

// Realce de sintaxe mínimo: headings na fonte de display, ênfase e código. O resto fica
// para a Fatia 2.
const realce = HighlightStyle.define([
  { tag: t.heading, fontFamily: "var(--fonte-display)", fontWeight: "500" },
  { tag: t.strong, fontWeight: "600" },
  { tag: t.emphasis, fontStyle: "italic" },
  {
    tag: [t.monospace, t.contentSeparator],
    fontFamily: "var(--fonte-mono)",
    fontSize: "13px",
  },
  { tag: [t.link, t.url], color: "var(--color-musgo)" },
  { tag: t.comment, color: "var(--color-tinta-suave)" },
]);

export const realceEditor = syntaxHighlighting(realce);
