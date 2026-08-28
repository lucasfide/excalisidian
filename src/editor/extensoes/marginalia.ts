// Marginália — o elemento de assinatura do produto (doc 06). Coluna de 76px à esquerda do
// texto, separada por uma hairline vertical contínua, com marcadores em estilo `meta`:
//
//   H1 / H2 / H3   na linha de um heading
//   ^id            na linha que termina com um id de bloco
//
// O indicador EMB de bloco embutido entra na Fatia 7, junto com os embeds.
//
// Implementado como gutter do CodeMirror 6: acompanha scroll e virtualização de graça. O
// pacote vendorizado esconde os gutters no tema dele (`.cm-gutters { display: none }`); o
// CSS de `estilos/marginalia.css` reativa só este.

import { gutter, GutterMarker } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";

const RE_HEADING = /^(#{1,6})\s/;
const RE_BLOCO_ID = /(?:^|\s)\^([A-Za-z0-9-]+)\s*$/;

type TipoMarca = "heading" | "bloco";

class MarcadorTexto extends GutterMarker {
  constructor(
    private readonly texto: string,
    private readonly tipo: TipoMarca,
  ) {
    super();
  }
  eq(outro: MarcadorTexto) {
    return outro.texto === this.texto && outro.tipo === this.tipo;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-marginalia-marca";
    el.dataset.tipo = this.tipo;
    el.textContent = this.texto;
    return el;
  }
}

function marcadorDaLinha(view: EditorView, linhaInicio: number): GutterMarker | null {
  const linha = view.state.doc.lineAt(linhaInicio);
  const texto = linha.text;

  const h = RE_HEADING.exec(texto);
  if (h) return new MarcadorTexto(`H${h[1].length}`, "heading");

  const b = RE_BLOCO_ID.exec(texto);
  if (b) {
    const id = b[1];
    return new MarcadorTexto(
      "^" + (id.length > 8 ? id.slice(0, 7) + "…" : id),
      "bloco",
    );
  }

  return null;
}

export function marginalia() {
  return gutter({
    class: "cm-marginalia",
    lineMarker: (view, line) => marcadorDaLinha(view, line.from),
    lineMarkerChange: (update) => update.docChanged,
  });
}
