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
//
// VISIBILIDADE É GEOMÉTRICA, NÃO POR EVENTO DE FRONTEIRA. Não existe mais mouseenter/mouseleave/
// relatedTarget/timeout aqui — duas tentativas de conserto por esse caminho falharam (ver ADR-18
// e o histórico do arquivo), porque o alvo (a alça) mora fora do elemento que dispara o gatilho
// (o view.dom), e cruzar essa borda é obrigatório no trajeto do mouse. Em vez disso: um único
// `mousemove` em `window` faz, a cada movimento, um teste de ponto-dentro-de-retângulo contra a
// "zona ativa" = o retângulo do view.dom esticado ZONA_RESPIRO_PX pra esquerda. Texto, respiro e
// alça viram uma região CONTÍNUA — não há fronteira nenhuma pra cruzar entre o texto e a alça, e
// a categoria inteira de bug some. A alça também deixa de ser 16×16 fixos: o container invisível
// tem a largura do respiro e a ALTURA DO BLOCO inteiro (o botão visível continua 16px alinhado ao
// topo), pra que sair pela esquerda de qualquer linha de um bloco de várias linhas atravesse ela.
//
// E `update()` NUNCA esconde por `geometryChanged`: o inline-preview reconstrói decorações a cada
// selectionSet/focusChanged, o remedimento liga a flag Height (@codemirror/view 6.43.9,
// dist/index.js:1706 + 6291) e `geometryChanged` acaba disparando o tempo todo — inclusive de
// forma reentrante, de dentro do próprio `posAtCoords` (readMeasured, index.js:8310-8314, roda um
// measure síncrono que reentrega o ViewUpdate aos plugins). Pelo mesmo motivo, `update()` não pode
// chamar `posAtCoords`/`coordsAtPos`: `readMeasured` LANÇA durante um ciclo de update. Toda
// releitura de geometria acontece fora do update — no mousemove ou no listener de rolagem.

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

const LARGURA_ALCA_PX = 24; // largura do container invisível; encosta na borda do view.dom
const ZONA_RESPIRO_PX = 32; // respiro lateral da coluna (doc 06, Layout) — o quanto a zona estica

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
  /** Última posição conhecida do ponteiro, pra reavaliar sem esperar um mousemove novo (rolagem). */
  private ultimoPonteiro: { x: number; y: number } | null = null;
  /** Retângulos do editor em cache — ler layout a cada pixel de mousemove seria caro.
   * `null` = invalidado, remede na próxima leitura. Quem invalida: rolagem, resize da janela,
   * o ResizeObserver do próprio view.dom e `geometryChanged` (ver `constructor`/`update`). */
  private retangulos: { editor: DOMRect; conteudo: DOMRect } | null = null;
  private observadorTamanho: ResizeObserver | null = null;

  private medirRetangulos() {
    if (!this.retangulos) {
      this.retangulos = {
        editor: this.view.dom.getBoundingClientRect(),
        conteudo: this.view.contentDOM.getBoundingClientRect(),
      };
    }
    return this.retangulos;
  }

  private aoMouseMove = (event: MouseEvent) => {
    this.ultimoPonteiro = { x: event.clientX, y: event.clientY };
    this.reavaliar();
  };

  /**
   * O teste geométrico inteiro, a partir de `ultimoPonteiro`. Chamado pelo mousemove e pela
   * rolagem — nunca de dentro de `update()` (usa coordsAtPos/posAtCoords, que lançam durante um
   * ciclo de update do CodeMirror).
   */
  private reavaliar() {
    if (this.arrasto) return; // durante o arraste, a posição da alça não muda
    if (this.view.state.readOnly) return; // ADR-13: 2ª vista do split não recebe a alça
    const ponteiro = this.ultimoPonteiro;
    if (!ponteiro) return;

    const { editor, conteudo } = this.medirRetangulos();
    // Zona ativa: o view.dom esticado pra esquerda até cobrir respiro + alça. Texto e alça ficam
    // numa região contínua, sem fronteira no meio do trajeto do mouse.
    const dentroDaZona =
      ponteiro.x >= editor.left - ZONA_RESPIRO_PX &&
      ponteiro.x <= editor.right &&
      ponteiro.y >= editor.top &&
      ponteiro.y <= editor.bottom;
    if (!dentroDaZona) {
      this.esconderAlca();
      return;
    }

    // A zona inclui faixa fora do conteúdo real; grampeia o x pra dentro do .cm-content antes de
    // resolver a posição (posAtCoords resolve a linha pelo y, mas o x precisa ser sensato).
    const x = Math.min(Math.max(ponteiro.x, conteudo.left + 1), conteudo.right - 1);
    const pos = this.view.posAtCoords({ x, y: ponteiro.y });
    const bloco =
      pos == null ? null : blocoEm(syntaxTree(this.view.state), this.view.state.doc, pos);
    if (!bloco) {
      // Linha em branco entre blocos, ou ponto fora do viewport renderizado. Se o ponteiro está na
      // faixa à esquerda do texto (respiro/alça), mantém a alça que já está na tela — sem isso ela
      // pisca justamente no trecho final do caminho até ela.
      if (ponteiro.x >= conteudo.left) this.esconderAlca();
      return;
    }

    // Linha 1 é o título da nota (doc 04 §3.1): nunca recebe alça de mover, seja H1 ou não.
    if (this.view.state.doc.lineAt(bloco.de).number === 1) {
      this.esconderAlca();
      return;
    }

    this.blocoAtual = bloco;
    // Reposiciona sempre, mesmo com o bloco inalterado: a rolagem reavalia por aqui e a alça tem
    // que acompanhar o bloco na tela.
    this.posicionarAlca(bloco);
  }

  private garantirAlca(): HTMLDivElement {
    if (this.alcaDom) return this.alcaDom;
    const dom = document.createElement("div");
    dom.className = "cm-alca-bloco";
    document.body.appendChild(dom);
    this.alcaRoot = createRoot(dom);
    this.alcaRoot.render(createElement(AlcaBloco, { onPointerDown: this.aoIniciarArrasto }));
    this.alcaDom = dom;
    return dom;
  }

  private posicionarAlca(bloco: Bloco) {
    const topo = this.view.coordsAtPos(bloco.de);
    if (!topo) return;
    // Altura do bloco inteiro (topo da primeira linha até o fim da última): a área de acerto cobre
    // o bloco todo, então sair pela esquerda de qualquer linha dele atravessa a alça. O botão
    // visível continua 16px, alinhado ao topo do container (moverBloco.css).
    const fim = this.view.coordsAtPos(bloco.ate, -1);
    const altura = Math.max((fim?.bottom ?? topo.bottom) - topo.top, topo.bottom - topo.top);
    const { editor } = this.medirRetangulos();
    const dom = this.garantirAlca();
    dom.style.left = `${editor.left - LARGURA_ALCA_PX}px`;
    dom.style.top = `${topo.top}px`;
    dom.style.height = `${altura}px`;
    dom.style.display = "flex";
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

  // Rolagem e redimensionamento invalidam os retângulos em cache e reposicionam a alça a partir da
  // última posição do ponteiro — sem isso ela fica grudada na tela enquanto o bloco anda. Escuta em
  // `window` na fase de captura porque `scroll` não borbulha: assim pega tanto o `view.scrollDOM`
  // quanto qualquer scroller ancestral que mova o editor. Roda fora do ciclo de update do CM6,
  // então pode ler geometria à vontade.
  private aoRolarOuRedimensionar = () => {
    this.retangulos = null;
    this.reavaliar();
  };

  /** O layout do editor mudou de tamanho/lugar (split, sidebar, divisória). Só invalida e
   * esconde — de propósito NÃO chama `reavaliar()`, que leria geometria do CodeMirror
   * (`posAtCoords` → `readMeasured`, que lança se cair dentro de um ciclo de update). O
   * próximo movimento do mouse remede e reposiciona certo. */
  private aoMudarTamanho = () => {
    this.retangulos = null;
    this.esconderAlca();
  };

  constructor(view: EditorView) {
    this.view = view;
    window.addEventListener("mousemove", this.aoMouseMove);
    window.addEventListener("scroll", this.aoRolarOuRedimensionar, { capture: true, passive: true });
    window.addEventListener("resize", this.aoRolarOuRedimensionar);

    // O `resize` de `window` só dispara quando a JANELA muda de tamanho — dividir a tela
    // (dockview), recolher a sidebar ou arrastar a divisória do split mudam o tamanho e a
    // posição do editor sem tocar na janela. Sem isto, o retângulo em cache continuava sendo o
    // de antes do split e a alça aparecia no painel errado (bug real: nota à direita, alça
    // desenhada dentro do canvas à esquerda). O ResizeObserver pega exatamente esse caso.
    if (typeof ResizeObserver !== "undefined") {
      this.observadorTamanho = new ResizeObserver(this.aoMudarTamanho);
      this.observadorTamanho.observe(view.dom);
    }
  }

  update(update: ViewUpdate) {
    // `docChanged`: os offsets de `blocoAtual` viraram lixo e a alça precisa sumir até o próximo
    // movimento do mouse. `geometryChanged` NÃO esconde mais nada — dispara o tempo todo por causa
    // do live preview (ver o comentário no topo do arquivo) e era a causa real de a alça sumir
    // antes do clique chegar nela. Mas ele é um sinal bom de que a geometria pode ter mudado,
    // então INVALIDA o cache (só põe `null`, não lê layout nenhum — `readMeasured` lança durante
    // um update); a remedição acontece depois, no mousemove ou na rolagem.
    if (update.docChanged) this.esconderAlca();
    if (update.geometryChanged) this.retangulos = null;
  }

  destroy() {
    window.removeEventListener("mousemove", this.aoMouseMove);
    window.removeEventListener("scroll", this.aoRolarOuRedimensionar, { capture: true });
    window.removeEventListener("resize", this.aoRolarOuRedimensionar);
    this.observadorTamanho?.disconnect();
    this.finalizarArrasto();
    this.alcaRoot?.unmount();
    this.alcaDom?.remove();
    this.linhaSolturaDom?.remove();
  }
}

export const moverBloco: Extension = ViewPlugin.fromClass(AlcaBlocoPlugin);
