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
// tem `overflow-hidden`, e o respiro de 32px da coluna (pl-8, PainelDocumento.tsx) fica FORA do
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

import {
  ChangeSet,
  RangeSetBuilder,
  StateEffect,
  StateField,
  type Extension,
  type Text,
} from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import AlcaBloco from "../../ui/excalisidian/AlcaBloco";
import { blocoEm, blocosIrmaos, type Bloco } from "./blocoMarkdown";

export interface MovimentoBloco {
  /** Duas mudanças no espaço de coordenadas do documento original: tirar e reinserir. */
  changes: { from: number; to: number; insert: string }[];
  /** Onde deixar o cursor depois — início do bloco movido, na posição nova. */
  novaPosicaoCursor: number;
}

/** Onde soltar: logo antes ou logo depois de `irmaos[indice]`. */
export interface AlvoSoltura {
  indice: number;
  lado: "antes" | "depois";
}

// MODELO DE LINHAS, NÃO DE SEPARADOR ÚNICO. A versão anterior reconstruía a faixa inteira de
// irmãos juntando todos com o separador do PRIMEIRO par — e o primeiro par costuma ser o título
// com o que vem embaixo dele. Título colado no texto (`\n`) grudava todos os parágrafos num só;
// título com duas linhas em branco espalhava linha em branco extra por tudo. Agora o bloco é
// tirado com UMA quebra de linha e reinserido no alvo; as linhas em branco ficam paradas no
// lugar, como bloco vazio do Notion, e nada fora dos dois pontos tocados muda.

/** Início da primeira linha do bloco (item aninhado começa no marcador, não na indentação). */
function inicio(doc: Text, b: Bloco): number {
  return doc.lineAt(b.de).from;
}

function fim(doc: Text, b: Bloco): number {
  return doc.lineAt(b.ate).to;
}

function separadorEntre(doc: Text, a: Bloco, b: Bloco): string {
  return doc.sliceString(fim(doc, a), inicio(doc, b));
}

/** Tem linha em branco no meio? `null` (sem vizinho) conta como borda, igual linha em branco. */
function temLinhaEmBranco(separador: string | null): boolean {
  return separador === null || /\n[ \t]*\n/.test(separador);
}

// Colar dois blocos com `\n` simples só é seguro entre parágrafo e heading ATX. Qualquer outro
// par muda de sentido no Markdown: parágrafo embaixo de lista/citação vira continuação preguiçosa
// dela, parágrafo em cima de `---` vira heading Setext, linha embaixo de tabela vira linha da
// tabela. Nesses casos a junção nova leva linha em branco.
const COLAGEM_SEGURA = /^(?:Paragraph|ATXHeading[1-6])$/;

function juntar(irmaos: Bloco[], doc: Text, a: Bloco, b: Bloco): string {
  if (a.tipo === "ListItem") {
    // Dentro de uma lista, repete o espaçamento que ela já usa (lista compacta ou espaçada).
    return irmaos.length > 1 ? separadorEntre(doc, irmaos[0], irmaos[1]) : "\n";
  }
  return COLAGEM_SEGURA.test(a.tipo) && COLAGEM_SEGURA.test(b.tipo) ? "\n" : "\n\n";
}

/**
 * Todos os lugares onde dá pra soltar, de cima pra baixo. Entre dois irmãos colados (`\n`
 * simples) há um alvo só; entre dois irmãos separados por linha em branco há dois — logo depois
 * do de cima (o bloco entra no grupo dele) e logo antes do de baixo. Nunca antes da linha 1
 * (título da nota, doc 04 §3.1). Numa lista, só "antes de cada item" e "depois do último".
 */
export function alvosDeSoltura(doc: Text, irmaos: Bloco[]): AlvoSoltura[] {
  const alvos: AlvoSoltura[] = [];
  const lista = irmaos[0]?.tipo === "ListItem";
  irmaos.forEach((b, i) => {
    if (i > 0 && !lista && separadorEntre(doc, irmaos[i - 1], b) !== "\n") {
      alvos.push({ indice: i - 1, lado: "depois" });
    }
    if (doc.lineAt(b.de).number !== 1) alvos.push({ indice: i, lado: "antes" });
  });
  if (irmaos.length > 0) alvos.push({ indice: irmaos.length - 1, lado: "depois" });
  return alvos;
}

/** Posição no documento que representa o alvo na tela (topo do bloco, ou fim dele). */
export function posicaoDoAlvo(doc: Text, irmaos: Bloco[], alvo: AlvoSoltura): number {
  const b = irmaos[alvo.indice];
  return alvo.lado === "antes" ? inicio(doc, b) : fim(doc, b);
}

/**
 * Calcula a mudança de texto pra mover `irmaos[origem]` pro `alvo`. Puro — recebe o `Text` e a
 * lista de irmãos já resolvida (blocosIrmaos), nunca `EditorView`, pra ser testável sem DOM.
 *
 * `null` quando não há o que mover: menos de dois irmãos, índice fora da faixa, ou soltar num
 * lugar que deixa o texto igual (nem um undo à toa).
 */
export function calcularMovimento(
  doc: Text,
  irmaos: Bloco[],
  origem: number,
  alvo: AlvoSoltura,
): MovimentoBloco | null {
  if (irmaos.length < 2) return null;
  if (origem < 0 || origem >= irmaos.length) return null;
  if (alvo.indice < 0 || alvo.indice >= irmaos.length || alvo.indice === origem) return null;

  const movido = irmaos[origem];
  const texto = doc.sliceString(inicio(doc, movido), fim(doc, movido));
  const anterior = irmaos[origem - 1] ?? null;
  const seguinte = irmaos[origem + 1] ?? null;

  // 1) Tirar o bloco com uma quebra de linha só. Se ele estava ilhado por linha em branco dos
  //    dois lados, leva junto a de baixo — senão sobrariam duas linhas em branco seguidas.
  let remover: { from: number; to: number };
  if (!seguinte) {
    remover = { from: fim(doc, anterior!), to: fim(doc, movido) };
  } else {
    const antes = anterior ? separadorEntre(doc, anterior, movido) : null;
    const depois = separadorEntre(doc, movido, seguinte);
    remover =
      temLinhaEmBranco(antes) && temLinhaEmBranco(depois)
        ? { from: inicio(doc, movido), to: inicio(doc, seguinte) }
        : { from: inicio(doc, movido), to: fim(doc, movido) + 1 };
  }

  // 2) Reinserir no alvo, com a junção certa pro par de blocos que fica colado.
  const referencia = irmaos[alvo.indice];
  let posicao: number;
  let insert: string;
  let deslocamento: number; // quanto de `insert` vem antes do texto do bloco
  if (alvo.lado === "antes") {
    posicao = inicio(doc, referencia);
    // Se o de cima da referência estava colado nela, o bloco movido fica colado nele também.
    const deCima = irmaos[alvo.indice - 1];
    const coladoEmCima =
      deCima &&
      deCima !== movido &&
      separadorEntre(doc, deCima, referencia) === "\n" &&
      juntar(irmaos, doc, deCima, movido) !== "\n";
    const prefixo = coladoEmCima ? "\n" : "";
    insert = prefixo + texto + juntar(irmaos, doc, movido, referencia);
    deslocamento = prefixo.length;
  } else {
    posicao = fim(doc, referencia);
    const prefixo = juntar(irmaos, doc, referencia, movido);
    insert = prefixo + texto;
    deslocamento = prefixo.length;
  }

  const changes = [
    { from: remover.from, to: remover.to, insert: "" },
    { from: posicao, to: posicao, insert },
  ].sort((a, b) => a.from - b.from);
  const conjunto = ChangeSet.of(changes, doc.length);
  if (conjunto.apply(doc).eq(doc)) return null;

  return { changes, novaPosicaoCursor: conjunto.mapPos(posicao, -1) + deslocamento };
}

// --- Alça e arraste (DOM, não testável sem browser — mesmo limite de selecaoDeBloco.ts) ---

const LARGURA_ALCA_PX = 24; // largura do container invisível; encosta no começo da linha do texto
const ZONA_RESPIRO_PX = 32; // respiro lateral da coluna (doc 06, Layout) — o quanto a zona estica

interface EstadoArrasto {
  irmaos: Bloco[];
  alvos: AlvoSoltura[];
  origem: number;
  startY: number;
  engajado: boolean;
  destino: AlvoSoltura | null;
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
    // Hover na alça realça o bloco que ela move. Durante o arraste o ponteiro sai da alça, mas o
    // realce fica até soltar (finalizarArrasto limpa).
    dom.addEventListener("mouseenter", () => {
      if (this.blocoAtual) this.realcar(this.blocoAtual);
    });
    dom.addEventListener("mouseleave", () => {
      if (!this.arrasto) this.realcar(null);
    });
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
    // Encosta no texto, não na borda do editor: o `.cm-content` tem largura máxima e fica
    // centralizado no painel, então a borda do view.dom pode estar longe da primeira letra. Usa o
    // começo da LINHA (não `bloco.de`) pra item aninhado ficar alinhado à própria indentação.
    const inicioLinha = this.view.coordsAtPos(this.view.state.doc.lineAt(bloco.de).from, 1);
    const esquerda = (inicioLinha ?? topo).left;
    const dom = this.garantirAlca();
    dom.style.left = `${esquerda - LARGURA_ALCA_PX}px`;
    dom.style.top = `${topo.top}px`;
    dom.style.height = `${altura}px`;
    dom.style.display = "flex";
  }

  private esconderAlca() {
    this.blocoAtual = null;
    this.realcar(null);
    if (this.alcaDom) this.alcaDom.style.display = "none";
  }

  /** Liga/desliga o realce do bloco. Não despacha se já está no estado pedido — `esconderAlca`
   * roda também de dentro de `update()` (docChanged), onde despachar lança; nesse caso o
   * StateField já zerou o realce sozinho, então a comparação sai igual e nada é despachado. */
  private realcar(bloco: Bloco | null) {
    const atual = this.view.state.field(campoRealce, false) ?? null;
    if (atual?.de === bloco?.de && atual?.ate === bloco?.ate) return;
    this.view.dispatch({ effects: definirRealce.of(bloco ? { de: bloco.de, ate: bloco.ate } : null) });
  }

  private aoIniciarArrasto = (event: React.PointerEvent) => {
    if (event.button !== 0 || !this.blocoAtual) return;
    event.preventDefault();

    const arvore = syntaxTree(this.view.state);
    const irmaos = blocosIrmaos(arvore, this.view.state.doc, this.blocoAtual);
    const origem = irmaos.findIndex((b) => b.de === this.blocoAtual!.de);
    if (origem === -1 || irmaos.length < 2) return;

    const alvos = alvosDeSoltura(this.view.state.doc, irmaos);
    this.arrasto = { irmaos, alvos, origem, startY: event.clientY, engajado: false, destino: null };

    window.addEventListener("pointermove", this.aoMoverArrasto);
    window.addEventListener("pointerup", this.aoSoltarArrasto);
    window.addEventListener("keydown", this.aoTeclarNoArrasto, true);
  };

  /** Altura na tela de um alvo: topo do bloco ("antes") ou base da última linha dele ("depois"). */
  private yDoAlvo(irmaos: Bloco[], alvo: AlvoSoltura): number | null {
    const pos = posicaoDoAlvo(this.view.state.doc, irmaos, alvo);
    const coords = this.view.coordsAtPos(pos, alvo.lado === "antes" ? 1 : -1);
    if (!coords) return null;
    return alvo.lado === "antes" ? coords.top : coords.bottom;
  }

  private alvoMaisProximo(info: EstadoArrasto, clientY: number): AlvoSoltura | null {
    let melhor: AlvoSoltura | null = null;
    let melhorDist = Infinity;
    for (const alvo of info.alvos) {
      const y = this.yDoAlvo(info.irmaos, alvo);
      if (y === null) continue;
      const dist = Math.abs(y - clientY);
      if (dist < melhorDist) {
        melhorDist = dist;
        melhor = alvo;
      }
    }
    return melhor;
  }

  private aoMoverArrasto = (event: PointerEvent) => {
    const info = this.arrasto;
    if (!info) return;
    if (!info.engajado) {
      if (Math.abs(event.clientY - info.startY) < 4) return;
      info.engajado = true;
    }
    const alvo = this.alvoMaisProximo(info, event.clientY);
    info.destino = alvo;
    if (alvo) this.mostrarLinhaSoltura(info.irmaos, alvo);
    else this.esconderLinhaSoltura();
  };

  private mostrarLinhaSoltura(irmaos: Bloco[], alvo: AlvoSoltura) {
    if (!this.linhaSolturaDom) {
      const dom = document.createElement("div");
      dom.className = "cm-linha-soltura";
      document.body.appendChild(dom);
      this.linhaSolturaDom = dom;
    }
    const y = this.yDoAlvo(irmaos, alvo);
    const editorRect = this.view.dom.getBoundingClientRect();
    if (y === null) return;
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
      changes: movimento.changes,
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

// --- Realce do bloco sob a alça ---
// Decoração de linha do próprio CodeMirror (fundo `lavagem`, doc 06: "hover de linha"), e não um
// retângulo por cima: uma camada `position: fixed` cobriria o texto, a decoração fica atrás dele.

interface FaixaRealce {
  de: number;
  ate: number;
}

const definirRealce = StateEffect.define<FaixaRealce | null>();

const campoRealce = StateField.define<FaixaRealce | null>({
  create: () => null,
  update(valor, tr) {
    for (const efeito of tr.effects) if (efeito.is(definirRealce)) return efeito.value;
    // Texto mudou: a faixa virou lixo. A alça também some nesse caso (update do plugin).
    return tr.docChanged ? null : valor;
  },
  provide: (campo) =>
    EditorView.decorations.compute([campo], (state) => {
      const faixa = state.field(campo);
      if (!faixa) return Decoration.none;
      const doc = state.doc;
      const primeira = doc.lineAt(faixa.de).number;
      const ultima = doc.lineAt(Math.min(faixa.ate, doc.length)).number;
      const construtor = new RangeSetBuilder<Decoration>();
      for (let n = primeira; n <= ultima; n++) {
        const classes = ["cm-bloco-realcado"];
        if (n === primeira) classes.push("cm-bloco-realcado-topo");
        if (n === ultima) classes.push("cm-bloco-realcado-base");
        const inicio = doc.line(n).from;
        construtor.add(inicio, inicio, Decoration.line({ class: classes.join(" ") }));
      }
      return construtor.finish();
    }),
});

export const moverBloco: Extension = [campoRealce, ViewPlugin.fromClass(AlcaBlocoPlugin)];
