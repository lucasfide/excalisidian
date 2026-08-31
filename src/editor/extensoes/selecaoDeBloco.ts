// Clique triplo seleciona o bloco (doc 09 ADR-18), não a linha. O CodeMirror por padrão
// inclui a quebra de linha final na seleção de clique triplo (`rangeForClick`, em
// @codemirror/view — `if (to < doc.length && to == line.to) to++`), e é esse `to++` que faz o
// realce vazar pro começo da linha de baixo — o bug relatado. Aqui a gente intercepta o
// mousedown de detail 3 antes do CodeMirror processar o dele, e substitui pela seleção do
// bloco inteiro (blocoMarkdown.ts): um parágrafo de várias linhas feito com Shift+Enter
// seleciona inteiro; a quebra final nunca entra.
//
// Limitação aceita: clicar-e-arrastar depois do triplo clique (estender a seleção bloco a
// bloco) não é implementado — exigiria a interface EditorView.mouseSelectionStyle inteira.
// Fica só o clique triplo simples.

import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";

import { blocoEm } from "./blocoMarkdown";

export const selecaoDeBloco = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (event.detail !== 3 || event.button !== 0) return false;

    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos == null) return false;

    const bloco = blocoEm(syntaxTree(view.state), view.state.doc, pos);
    if (!bloco) return false; // nada reconhecido como bloco: cai no padrão do CodeMirror

    event.preventDefault();
    view.dispatch({ selection: EditorSelection.range(bloco.de, bloco.ate) });
    return true;
  },
});
