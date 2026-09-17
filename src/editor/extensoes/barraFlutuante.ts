// Posiciona BarraFlutuanteFormatacao.tsx acima da seleção ativa (doc 04 §3.4) — usando o sistema de tooltip nativo do CodeMirror
// (`showTooltip`) em vez de calcular coordenadas na mão — ele já resolve scroll, reflow e borda
// da viewport sozinho. Padrão oficial do CM6 ("cursor tooltip example",
// codemirror.net/examples/tooltip): StateField<Tooltip | null> que só recria o tooltip quando
// a posição de verdade muda, e `create(view)` monta um root React dentro do `dom` do tooltip.

import { EditorState, StateEffect, StateField, type Extension } from "@codemirror/state";
import {
  EditorView,
  showTooltip,
  tooltips,
  ViewPlugin,
  type PluginValue,
  type Tooltip,
} from "@codemirror/view";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import BarraFlutuanteFormatacao from "../../ui/excalisidian/BarraFlutuanteFormatacao";
import { usePrefsStore } from "../../estado/prefsStore";

interface EstadoFoco {
  // Foco do DOM está em algum ponto dentro desta vista (`view.dom`) — corpo do editor ou
  // célula de tabela, tanto faz.
  temFoco: boolean;
  // Dentro de `temFoco`, o elemento focado é o `contenteditable` de uma célula de tabela
  // (doc 14): outro campo editável, a barra apontaria pro lugar errado e por isso some.
  naCelula: boolean;
}

const ESTADO_FOCO_INICIAL: EstadoFoco = { temFoco: false, naCelula: false };

/** Despachado pelo `RastreadorDeFoco` sempre que o foco muda de dentro/fora da vista ou de
 * dentro/fora de uma célula de tabela — é o que faz `campoFoco` (abaixo) reagir sem depender de
 * o usuário mover a seleção. */
export const efeitoFoco = StateEffect.define<EstadoFoco>();

// `campoFoco`, `campoAcoplada` e `construirTooltip` são exportados só para o teste
// (barraFlutuante.test.ts) montar um estado com foco já concedido sem precisar de uma
// `EditorView` de verdade — `construirTooltip` não toca em `view`, só em `state`.
export const campoFoco = StateField.define<EstadoFoco>({
  create: () => ESTADO_FOCO_INICIAL,
  update(estado, tr) {
    for (const efeito of tr.effects) {
      if (efeito.is(efeitoFoco)) estado = efeito.value;
    }
    return estado;
  },
});

/**
 * `EditorView.focusChangeEffect` sozinho não basta: o `contenteditable` de uma célula de
 * tabela (`table-widget.ts`) vive dentro do `contentDOM` desta mesma vista, então mover o foco
 * pra lá não é, pro CodeMirror, uma perda de foco — `view.hasFocus` pode continuar dizendo que
 * sim. Este plugin ouve `focusin`/`focusout` no `document` inteiro (eles borbulham; `focus`/
 * `blur` não borbulham e por isso não bastariam) e decide pelo `document.activeElement` se o
 * foco está dentro desta vista e, dentro dela, dentro de uma célula (`.cm-atomic-table`) —
 * despachando o resultado como efeito.
 */
class RastreadorDeFoco implements PluginValue {
  private ultimo: EstadoFoco = ESTADO_FOCO_INICIAL;
  private readonly view: EditorView;

  constructor(view: EditorView) {
    this.view = view;
    document.addEventListener("focusin", this.verificar);
    document.addEventListener("focusout", this.verificar);
  }

  // Um microtask: no instante do próprio evento `document.activeElement` pode ainda estar em
  // transição (por exemplo em `<body>`, entre o elemento antigo perder o foco e o novo ganhar)
  // antes do navegador assentar no elemento final — ler depois de um microtask garante o valor
  // definitivo, igual ao `requestAnimationFrame` usado em `focusTableCell` pro mesmo motivo.
  private readonly verificar = () => {
    queueMicrotask(() => {
      const ativo = document.activeElement;
      const dentro = !!ativo && this.view.dom.contains(ativo);
      const novo: EstadoFoco = {
        temFoco: dentro,
        naCelula: dentro && !!ativo?.closest(".cm-atomic-table"),
      };
      if (novo.temFoco === this.ultimo.temFoco && novo.naCelula === this.ultimo.naCelula) return;
      this.ultimo = novo;
      this.view.dispatch({ effects: efeitoFoco.of(novo) });
    });
  };

  destroy() {
    document.removeEventListener("focusin", this.verificar);
    document.removeEventListener("focusout", this.verificar);
  }
}

/** Barra acoplada embaixo da nota (PainelDocumento): a flutuante some. A preferência vive no
 * prefsStore, fora do estado do CodeMirror — o `SincronizadorAcoplada` traduz cada mudança
 * dela num efeito, senão o tooltip só sumiria no próximo movimento do cursor. */
const efeitoAcoplada = StateEffect.define<boolean>();

export const campoAcoplada = StateField.define<boolean>({
  create: () => usePrefsStore.getState().barraFormatacaoAcoplada,
  update(valor, tr) {
    for (const efeito of tr.effects) {
      if (efeito.is(efeitoAcoplada)) valor = efeito.value;
    }
    return valor;
  },
});

class SincronizadorAcoplada implements PluginValue {
  private readonly cancelar: () => void;

  constructor(view: EditorView) {
    this.cancelar = usePrefsStore.subscribe((estado, anterior) => {
      if (estado.barraFormatacaoAcoplada === anterior.barraFormatacaoAcoplada) return;
      view.dispatch({ effects: efeitoAcoplada.of(estado.barraFormatacaoAcoplada) });
    });
  }

  destroy() {
    this.cancelar();
  }
}

function montarTooltip(view: EditorView) {
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
}

export function construirTooltip(state: EditorState): Tooltip | null {
  // A segunda vista de um split (doc 09 ADR-13) é somente-leitura: `view.dispatch` de uma
  // mudança ainda passaria (o guard de somente-leitura do CM6 bloqueia entrada por teclado/
  // mouse, não um dispatch programático como o dos botões) — então a barra nem aparece ali.
  if (state.readOnly) return null;

  if (state.field(campoAcoplada)) return null;

  const foco = state.field(campoFoco);
  if (!foco.temFoco || foco.naCelula) return null;

  // Doc 04 §3.4 (usuário, 16/09/2026): sem seleção, a barra só aparece se a linha do cursor
  // estiver vazia — é a mesma linha que se está prestes a começar a escrever, então não há
  // texto embaixo pra cobrir. Numa linha com conteúdo, sem seleção, a barra não aparece (essa
  // regra mais ampla — barra acima do cursor em QUALQUER linha — já existiu (doc 14 §1.2) e
  // foi revertida por cobrir a linha de cima enquanto se digitava; aqui o caso é bem mais
  // restrito e não tem esse problema: assim que a primeira letra é digitada a linha deixa de
  // estar vazia e a barra some no mesmo instante). Quem quer a barra sempre à mão usa a barra
  // acoplada (PainelDocumento).
  const sel = state.selection.main;
  if (sel.empty) {
    const linha = state.doc.lineAt(sel.head);
    if (linha.length > 0) return null;
    return { pos: linha.from, above: true, create: montarTooltip };
  }

  return { pos: sel.from, end: sel.to, above: true, create: montarTooltip };
}

const campoBarraFlutuante = StateField.define<Tooltip | null>({
  create: construirTooltip,
  update(tooltipAtual, tr) {
    const focoMudou = tr.effects.some(
      (efeito) => efeito.is(efeitoFoco) || efeito.is(efeitoAcoplada),
    );
    if (!tr.docChanged && !tr.selection && !focoMudou) return tooltipAtual;
    const novo = construirTooltip(tr.state);
    // Não recria o DOM (perderia o root React à toa, e piscaria) se a posição não mudou de
    // verdade.
    if (tooltipAtual && novo && tooltipAtual.pos === novo.pos && tooltipAtual.end === novo.end) {
      return tooltipAtual;
    }
    return novo;
  },
  provide: (f) => showTooltip.from(f),
});

// `tooltips()` explícito: é o host que de fato posiciona/repinta o `.dom` do tooltip na
// viewport (scroll, borda, etc.) — o StateField só decide QUANDO e ONDE, não COMO desenhar.
export const barraFlutuante: Extension = [
  campoFoco,
  ViewPlugin.fromClass(RastreadorDeFoco),
  campoAcoplada,
  ViewPlugin.fromClass(SincronizadorAcoplada),
  campoBarraFlutuante,
  tooltips(),
];
