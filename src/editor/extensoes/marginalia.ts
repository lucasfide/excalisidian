// Marginália — o elemento de assinatura do produto (doc 06). Coluna de 76px à esquerda do
// texto, separada por uma hairline vertical contínua, com marcadores em estilo `meta`:
//
//   H1 / H2 / H3   na linha de um heading
//   ^id            na linha que termina com um id de bloco
//   EMB            na linha de um embed (`![[...]]`)
//
// Implementado como gutter do CodeMirror 6, não como overlay React: o gutter acompanha
// scroll, virtualização e altura variável de linha de graça — e há widgets de bloco altos
// (tabelas, imagens) que fariam qualquer overlay reimplementar `lineBlockAt` na mão.
//
// A leitura é sempre do documento vivo (`view.state.doc`), nunca do índice do vaultStore: o
// índice reflete o disco e ficaria atrasado em relação ao que o usuário acabou de digitar.
//
// O pacote vendorizado esconde os gutters no tema dele (`.cm-gutters { display: none }`);
// `marginalia.css` reativa só este.

import { gutter, GutterMarker } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";

import { nivelDoHeading, blockIdDaLinha, ehLinhaDeEmbed } from "../../indice/sintaxe";

/** Acima disto o id é truncado, para caber nos 76px sem quebrar linha. */
const MAX_ID = 8;

type TipoMarca = "heading" | "bloco" | "embed";

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
  const texto = view.state.doc.lineAt(linhaInicio).text;

  const nivel = nivelDoHeading(texto);
  if (nivel > 0) return new MarcadorTexto(`H${nivel}`, "heading");

  const id = blockIdDaLinha(texto);
  if (id) {
    const curto = id.length > MAX_ID ? `${id.slice(0, MAX_ID - 1)}…` : id;
    return new MarcadorTexto(`^${curto}`, "bloco");
  }

  if (ehLinhaDeEmbed(texto)) return new MarcadorTexto("EMB", "embed");

  return null;
}

export function marginalia() {
  return gutter({
    class: "cm-marginalia",
    lineMarker: (view, line) => marcadorDaLinha(view, line.from),
    lineMarkerChange: (update) => update.docChanged,
  });
}
