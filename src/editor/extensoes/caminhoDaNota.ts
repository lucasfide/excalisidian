// Pastas da nota, bem pequeno, acima do título. É um widget de bloco dentro do próprio
// CodeMirror, e não um elemento acima do editor: assim rola junto com o texto e herda o
// alinhamento da coluna (`.cm-content`, largura pela preferência do usuário) sem duplicar
// essa lógica fora dele. Estilo `meta` + `tinta-suave`, o mesmo da barra de status, que também
// mostra caminho (doc 06, Layout).
//
// Recebe o caminho por instância (não lê `caminhoAtivo`): com duas notas lado a lado, cada
// painel mostra o seu. Renomear/mover troca o `documentId` do editor, que remonta com o
// caminho novo.

import { StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";

import { pastaDe } from "../../vault/caminhos";

class CaminhoWidget extends WidgetType {
  constructor(readonly pastas: string[]) {
    super();
  }

  eq(outro: CaminhoWidget): boolean {
    return outro.pastas.join("/") === this.pastas.join("/");
  }

  toDOM(): HTMLElement {
    const el = document.createElement("div");
    el.className = "meta pb-2 text-tinta-suave select-none";
    el.textContent = this.pastas.join(" / ");
    return el;
  }
}

/** Nota na raiz do vault não tem pasta pra mostrar: nenhuma linha extra acima do título. */
export function caminhoDaNota(caminho: string): Extension {
  const pasta = pastaDe(caminho);
  if (!pasta) return [];
  const decoracoes = Decoration.set([
    Decoration.widget({
      widget: new CaminhoWidget(pasta.split("/")),
      block: true,
      side: -1,
    }).range(0),
  ]);
  // Widget de bloco precisa vir de um StateField (ViewPlugin não pode fornecer decoração de
  // bloco). Posição 0 com side -1 continua no topo com qualquer edição.
  return StateField.define<DecorationSet>({
    create: () => decoracoes,
    update: (valor, tr) => valor.map(tr.changes),
    provide: (campo) => EditorView.decorations.from(campo),
  });
}
