// Nome do arquivo e H1 da nota são a mesma coisa (doc 04). Editar o H1 na linha 1 e sair
// dela (não a cada tecla — ver docs/09) dispara um rename de verdade, com a mesma máquina de
// reescrita de backlinks de renomear.ts. A direção contrária (renomear pelo arquivo atualiza
// o H1) mora em src/vault/renomear.ts, não aqui.
//
// Mesmo padrão de wikilinksExcalisidian.ts/embedDesenho.ts: a origem é sempre a aba ativa
// (`workspaceStore.caminhoAtivo`), lida em tempo de evento — não um parâmetro por instância,
// porque `EditorNota.tsx` reusa um array de extensões só, fixo, entre todas as abas.

import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

import { useWorkspaceStore } from "../../estado/workspaceStore";
import { renomearArquivo } from "../../vault/renomear";
import { h1DaPrimeiraLinha } from "../../vault/tituloNota";

function linhaDoCursor(view: EditorView): number {
  return view.state.doc.lineAt(view.state.selection.main.head).number;
}

function h1Atual(view: EditorView): string | null {
  return h1DaPrimeiraLinha(view.state.doc.line(1).text);
}

export const sincronizarTituloComArquivo = ViewPlugin.fromClass(
  class {
    naLinha1: boolean;
    ultimoTitulo: string | null;

    constructor(view: EditorView) {
      this.naLinha1 = linhaDoCursor(view) === 1;
      this.ultimoTitulo = h1Atual(view);
    }

    update(update: ViewUpdate) {
      if (!update.docChanged && !update.selectionSet) return;
      const view = update.view;
      const agoraNaLinha1 = linhaDoCursor(view) === 1;

      // Só dispara ao SAIR da linha 1 — nunca a cada tecla enquanto ainda está nela.
      if (this.naLinha1 && !agoraNaLinha1) {
        const titulo = h1Atual(view);
        if (titulo !== null && titulo.length > 0 && titulo !== this.ultimoTitulo) {
          this.ultimoTitulo = titulo;
          const caminho = useWorkspaceStore.getState().caminhoAtivo;
          if (caminho) void renomearArquivo(caminho, titulo);
        }
      }
      this.naLinha1 = agoraNaLinha1;
    }
  },
);
