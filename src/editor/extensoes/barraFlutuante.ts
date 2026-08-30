// Posiciona BarraFlutuanteFormatacao.tsx acima da seleção ativa, usando o sistema de tooltip
// nativo do CodeMirror (`showTooltip`) em vez de calcular coordenadas na mão — ele já resolve
// scroll, reflow e borda da viewport sozinho. Padrão oficial do CM6 ("cursor tooltip example",
// codemirror.net/examples/tooltip): StateField<Tooltip | null> que só recria o tooltip quando
// a posição de verdade muda, e `create(view)` monta um root React dentro do `dom` do tooltip.

import { EditorState, StateField, type Extension } from "@codemirror/state";
import { showTooltip, tooltips, type Tooltip } from "@codemirror/view";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import BarraFlutuanteFormatacao from "../../ui/excalisidian/BarraFlutuanteFormatacao";

function construirTooltip(state: EditorState): Tooltip | null {
  // A segunda vista de um split (doc 09 ADR-13) é somente-leitura: `view.dispatch` de uma
  // mudança ainda passaria (o guard de somente-leitura do CM6 bloqueia entrada por teclado/
  // mouse, não um dispatch programático como o dos botões) — então a barra nem aparece ali.
  if (state.readOnly) return null;
  const sel = state.selection.main;
  if (sel.empty) return null;

  return {
    pos: sel.from,
    end: sel.to,
    above: true,
    create: (view) => {
      const dom = document.createElement("div");
      let root: Root | null = null;
      return {
        dom,
        mount: () => {
          root = createRoot(dom);
          root.render(createElement(BarraFlutuanteFormatacao, { view }));
        },
        destroy: () => {
          root?.unmount();
        },
      };
    },
  };
}

const campoBarraFlutuante = StateField.define<Tooltip | null>({
  create: construirTooltip,
  update(tooltipAtual, tr) {
    if (!tr.docChanged && !tr.selection) return tooltipAtual;
    const novo = construirTooltip(tr.state);
    // Não recria o DOM (perderia o root React à toa) se a posição não mudou de verdade.
    if (tooltipAtual && novo && tooltipAtual.pos === novo.pos && tooltipAtual.end === novo.end) {
      return tooltipAtual;
    }
    return novo;
  },
  provide: (f) => showTooltip.from(f),
});

// `tooltips()` explícito: é o host que de fato posiciona/repinta o `.dom` do tooltip na
// viewport (scroll, borda, etc.) — o StateField só decide QUANDO e ONDE, não COMO desenhar.
export const barraFlutuante: Extension = [campoBarraFlutuante, tooltips()];
