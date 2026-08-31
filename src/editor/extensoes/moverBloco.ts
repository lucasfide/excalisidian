// Mover bloco por arraste (doc 09 ADR-18, Fatia 6 Parte 3): alça ⠿ que aparece ao passar o
// mouse sobre um bloco, arrasta com eventos de ponteiro (nunca HTML5 drag-and-drop — o projeto
// já apanhou disso duas vezes: dockview precisou de dndStrategy="pointer", e ArvoreArquivos.tsx
// arrasta arquivo do mesmo jeito, na mão, com pointerdown/pointermove/pointerup).
//
// Escopo v1: só entre irmãos do mesmo nível (blocosIrmaos, blocoMarkdown.ts) — parágrafo entre
// parágrafos/headings/citações soltos, item de lista dentro da própria lista. Arrastar pra
// dentro/fora de uma lista exigiria reindentar e inserir marcador; fica de fora.
//
// A alça fica em `position: fixed`, fora da árvore do CodeMirror: o wrapper de EditorNota.tsx
// tem `overflow-hidden`, e o respiro de 32px da coluna (px-8, PainelDocumento.tsx) fica FORA do
// `view.dom` — um elemento posicionado com offset negativo *dentro* do view.dom seria cortado
// por esse overflow. `position: fixed` com coordenadas de viewport (coordsAtPos/getBoundingClientRect)
// escapa desse corte, do mesmo jeito que um tooltip/popover.

import type { Extension, Text } from "@codemirror/state";
import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import AlcaBloco from "../../ui/excalisidian/AlcaBloco";
import { blocoEm, blocosIrmaos, type Bloco } from "./blocoMarkdown";

export interface MovimentoBloco {
  from: number;
  to: number;
  insert: string;
  /** Onde deixar o cursor depois — início do bloco movido, na posição nova. */
  novaPosicaoCursor: number;
}

/**
 * Calcula a mudança de texto pra mover `irmaos[origem]` pra antes de `irmaos[destino]` (ou pro
 * fim, se `destino === irmaos.length`). Puro — recebe o `Text` e a lista de irmãos já resolvida
 * (blocosIrmaos), nunca `EditorView`, pra ser testável sem DOM.
 *
 * `null` quando não há o que mover: menos de dois irmãos, índice fora da faixa, ou destino igual
 * à posição atual (soltar no mesmo lugar não gera mudança nenhuma — nem um undo à toa).
 */
export function calcularMovimento(
  doc: Text,
  irmaos: Bloco[],
  origem: number,
  destino: number,
): MovimentoBloco | null {
  if (irmaos.length < 2) return null;
  if (origem < 0 || origem >= irmaos.length) return null;
  if (destino < 0 || destino > irmaos.length) return null;
  if (destino === origem || destino === origem + 1) return null;

  const textos = irmaos.map((b) => doc.sliceString(b.de, b.ate));
  // Todo par de irmãos consecutivos usa o mesmo separador (linha em branco entre blocos soltos,
  // quebra simples entre itens da mesma lista) — um representante basta pra reconstruir.
  const separador =
    irmaos.length > 1
      ? doc.sliceString(irmaos[0].ate, irmaos[1].de)
      : irmaos[0].tipo === "ListItem"
        ? "\n"
        : "\n\n";

  const ordem = irmaos.map((_, i) => i);
  const [movido] = ordem.splice(origem, 1);
  const indiceInsercao = destino > origem ? destino - 1 : destino;
  ordem.splice(indiceInsercao, 0, movido);

  const insert = ordem.map((i) => textos[i]).join(separador);
  const from = irmaos[0].de;
  const to = irmaos[irmaos.length - 1].ate;

  let novaPosicaoCursor = from;
  for (const i of ordem) {
    if (i === movido) break;
    novaPosicaoCursor += textos[i].length + separador.length;
  }

  return { from, to, insert, novaPosicaoCursor };
}

// --- Alça e arraste (DOM, não testável sem browser — mesmo limite de selecaoDeBloco.ts) ---

const DESLOCAMENTO_ALCA_PX = 24; // dentro do respiro de 32px, sem grudar na borda

interface EstadoArrasto {
  irmaos: Bloco[];
  origem: number;
  startY: number;
  engajado: boolean;
  destino: number | null;
}

class AlcaBlocoPlugin {
  private view: EditorView;
  private alcaDom: HTMLDivElement | null = null;
  private alcaRoot: Root | null = null;
  private linhaSolturaDom: HTMLDivElement | null = null;
  private blocoAtual: Bloco | null = null;
  private arrasto: EstadoArrasto | null = null;

  private aoMouseMove = (event: MouseEvent) => {
    if (this.arrasto) return; // durante o arraste, a posição da alça não muda por mousemove
    const pos = this.view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos == null) {
      this.esconderAlca();
      return;
    }
    const bloco = blocoEm(syntaxTree(this.view.state), this.view.state.doc, pos);
    if (!bloco || (this.blocoAtual && this.blocoAtual.de === bloco.de)) {
      if (!bloco) this.esconderAlca();
      return;
    }
    this.blocoAtual = bloco;
    this.posicionarAlca(bloco);
  };

  private aoMouseLeave = (event: MouseEvent) => {
    if (this.arrasto) return;
    // A alça mora fora do view.dom (position: fixed, no respiro de 32px — ver o comentário no
    // topo do arquivo), então ir do texto até ela SEMPRE cruza a borda do view.dom e dispara
    // este mouseleave. Sem este filtro, a alça sumiria bem no meio do caminho até o clique.
    const indoParaAlca =
      event.relatedTarget instanceof Node && this.alcaDom?.contains(event.relatedTarget);
    if (indoParaAlca) return;
    this.esconderAlca();
  };

  private aoMouseLeaveDaAlca = (event: MouseEvent) => {
    if (this.arrasto) return;
    const voltandoPraTexto =
      event.relatedTarget instanceof Node && this.view.dom.contains(event.relatedTarget);
    if (voltandoPraTexto) return;
    this.esconderAlca();
  };

  private garantirAlca(): HTMLDivElement {
    if (this.alcaDom) return this.alcaDom;
    const dom = document.createElement("div");
    dom.className = "cm-alca-bloco";
    dom.addEventListener("mouseleave", this.aoMouseLeaveDaAlca);
    document.body.appendChild(dom);
    this.alcaRoot = createRoot(dom);
    this.alcaRoot.render(createElement(AlcaBloco, { onPointerDown: this.aoIniciarArrasto }));
    this.alcaDom = dom;
    return dom;
  }

  private posicionarAlca(bloco: Bloco) {
    if (this.view.state.readOnly) return; // ADR-13: vista somente-leitura do split não recebe a alça
    const coords = this.view.coordsAtPos(bloco.de);
    if (!coords) return;
    const editorRect = this.view.dom.getBoundingClientRect();
    const dom = this.garantirAlca();
    dom.style.left = `${editorRect.left - DESLOCAMENTO_ALCA_PX}px`;
    dom.style.top = `${coords.top}px`;
    dom.style.display = "block";
  }

  private esconderAlca() {
    this.blocoAtual = null;
    if (this.alcaDom) this.alcaDom.style.display = "none";
  }

  private aoIniciarArrasto = (event: React.PointerEvent) => {
    if (event.button !== 0 || !this.blocoAtual) return;
    event.preventDefault();

    const arvore = syntaxTree(this.view.state);
    const irmaos = blocosIrmaos(arvore, this.view.state.doc, this.blocoAtual);
    const origem = irmaos.findIndex((b) => b.de === this.blocoAtual!.de);
    if (origem === -1 || irmaos.length < 2) return;

    this.arrasto = { irmaos, origem, startY: event.clientY, engajado: false, destino: null };

    window.addEventListener("pointermove", this.aoMoverArrasto);
    window.addEventListener("pointerup", this.aoSoltarArrasto);
    window.addEventListener("keydown", this.aoTeclarNoArrasto, true);
  };

  private gapMaisProximo(irmaos: Bloco[], clientY: number): number {
    // Posição vertical de cada "fronteira" entre irmãos (e antes do primeiro / depois do
    // último), em coordenadas de tela — mesma unidade de clientY.
    const bordas: number[] = [this.view.coordsAtPos(irmaos[0].de)?.top ?? 0];
    for (let i = 0; i < irmaos.length; i++) {
      const prox = i + 1 < irmaos.length ? this.view.coordsAtPos(irmaos[i + 1].de)?.top : null;
      const fimAtual = this.view.coordsAtPos(irmaos[i].ate)?.bottom ?? bordas[i];
      bordas.push(prox ?? fimAtual);
    }
    let melhorGap = 0;
    let melhorDist = Infinity;
    for (let gap = 0; gap < bordas.length; gap++) {
      const dist = Math.abs(bordas[gap] - clientY);
      if (dist < melhorDist) {
        melhorDist = dist;
        melhorGap = gap;
      }
    }
    return melhorGap;
  }

  private aoMoverArrasto = (event: PointerEvent) => {
    const info = this.arrasto;
    if (!info) return;
    if (!info.engajado) {
      if (Math.abs(event.clientY - info.startY) < 4) return;
      info.engajado = true;
    }
    const gap = this.gapMaisProximo(info.irmaos, event.clientY);
    info.destino = gap;
    this.mostrarLinhaSoltura(info.irmaos, gap);
  };

  private mostrarLinhaSoltura(irmaos: Bloco[], gap: number) {
    if (!this.linhaSolturaDom) {
      const dom = document.createElement("div");
      dom.className = "cm-linha-soltura";
      document.body.appendChild(dom);
      this.linhaSolturaDom = dom;
    }
    const pos = gap < irmaos.length ? irmaos[gap].de : irmaos[irmaos.length - 1].ate;
    const coords =
      gap < irmaos.length ? this.view.coordsAtPos(pos) : this.view.coordsAtPos(pos, -1);
    const editorRect = this.view.dom.getBoundingClientRect();
    if (!coords) return;
    const y = gap === 0 ? coords.top : gap < irmaos.length ? coords.top : coords.bottom;
    this.linhaSolturaDom.style.left = `${editorRect.left}px`;
    this.linhaSolturaDom.style.width = `${editorRect.width}px`;
    this.linhaSolturaDom.style.top = `${y}px`;
    this.linhaSolturaDom.style.display = "block";
  }

  private esconderLinhaSoltura() {
    if (this.linhaSolturaDom) this.linhaSolturaDom.style.display = "none";
  }

  private aoSoltarArrasto = () => {
    const info = this.arrasto;
    this.finalizarArrasto();
    if (!info?.engajado || info.destino === null) return;

    const movimento = calcularMovimento(this.view.state.doc, info.irmaos, info.origem, info.destino);
    if (!movimento) return;

    this.view.dispatch({
      changes: { from: movimento.from, to: movimento.to, insert: movimento.insert },
      selection: { anchor: movimento.novaPosicaoCursor },
      userEvent: "move.block",
    });
  };

  private aoTeclarNoArrasto = (event: KeyboardEvent) => {
    if (event.key === "Escape") this.finalizarArrasto();
  };

  private finalizarArrasto() {
    window.removeEventListener("pointermove", this.aoMoverArrasto);
    window.removeEventListener("pointerup", this.aoSoltarArrasto);
    window.removeEventListener("keydown", this.aoTeclarNoArrasto, true);
    this.arrasto = null;
    this.esconderLinhaSoltura();
    this.esconderAlca();
  }

  constructor(view: EditorView) {
    this.view = view;
    view.dom.addEventListener("mousemove", this.aoMouseMove);
    view.dom.addEventListener("mouseleave", this.aoMouseLeave);
  }

  update(update: ViewUpdate) {
    // Rolar ou editar pode deixar a alça grudada numa posição de tela que já não corresponde
    // mais ao bloco — mais simples esconder e deixar o próximo mousemove reposicionar.
    if (update.docChanged || update.geometryChanged) this.esconderAlca();
  }

  destroy() {
    this.view.dom.removeEventListener("mousemove", this.aoMouseMove);
    this.view.dom.removeEventListener("mouseleave", this.aoMouseLeave);
    this.finalizarArrasto();
    this.alcaRoot?.unmount();
    this.alcaDom?.remove();
    this.linhaSolturaDom?.remove();
  }
}

export const moverBloco: Extension = ViewPlugin.fromClass(AlcaBlocoPlugin);
