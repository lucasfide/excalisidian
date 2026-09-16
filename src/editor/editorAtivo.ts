// Rastreia a última `EditorView` de nota que recebeu foco — usado por pontos fora do React
// (paleta de comandos, barra de formatação flutuante) que precisam agir "na nota ativa" sem um
// ref descendo pelo layout inteiro (doc 14 §2.4, comando "Inserir tabela").
//
// Só rastreia foco, não decide o que é "aba ativa" no sentido do workspaceStore: se o foco sai
// do editor sem entrar em outro (ex.: abrir a paleta de comandos, que tira o foco do editor de
// propósito), a última `EditorView` focada continua sendo a resposta — igual
// `document.activeElement` faria pra um input comum que perdeu o foco.

import { ViewPlugin, type EditorView } from "@codemirror/view";

let editorAtivoAtual: EditorView | null = null;

/** Extensão a registrar em `EXTENSOES` (EditorNota.tsx) — uma por `EditorView` montada. */
export const rastrearEditorAtivo = ViewPlugin.define((view) => {
  const registrar = () => {
    editorAtivoAtual = view;
  };
  // `focusin` (borbulha) em vez de `focus` no `contentDOM`: cobre também o foco entrando numa
  // célula de tabela (um `contenteditable` à parte dentro do mesmo `view.dom`, ver
  // table-widget.ts) sem precisar de um listener próprio ali.
  view.dom.addEventListener("focusin", registrar);
  // A view pode montar já com foco (ex.: reabrir a mesma aba) — sem esperar um `focusin` novo.
  if (view.hasFocus) registrar();

  return {
    destroy() {
      view.dom.removeEventListener("focusin", registrar);
      if (editorAtivoAtual === view) editorAtivoAtual = null;
    },
  };
});

/** A última `EditorView` de nota que recebeu foco, ou `null` se nenhuma (ainda) recebeu, ou a
 * última foi destruída. */
export function editorAtivo(): EditorView | null {
  return editorAtivoAtual;
}
