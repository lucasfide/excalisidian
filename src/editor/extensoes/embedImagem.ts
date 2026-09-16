// `![[imagem.png]]` na nota (RF2.9, doc 02 §8, doc 04 §3.6): renderiza as imagens do vault.
//
// - Imagens na mesma linha aparecem lado a lado numa fileira que quebra quando não cabe.
// - Linha só de embeds de imagem, sem cursor: a fileira ocupa o lugar do texto. Com o cursor na
//   linha (ou texto junto), o texto fica e a fileira vem logo abaixo.
// - Alça no canto da imagem muda a largura, gravada no alias (`![[foto.png|400]]`); duplo clique
//   na alça volta ao tamanho natural.
// - Arrastar a imagem até a lateral de outra junta as duas na mesma linha; soltar entre linhas
//   de texto põe a imagem numa linha própria.
//
// O cálculo do que muda no texto mora em `imagensNaLinha.ts` (puro, testado). A imagem é lida
// pelo VaultAdapter e entra como blob URL: o WebView não carrega caminho do disco direto.
//
// StateField, não ViewPlugin: decoração de bloco vinda de plugin é rejeitada pelo CodeMirror
// (ver embedDesenho.ts).

import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  WidgetType,
} from "@codemirror/view";
import {
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type Range,
} from "@codemirror/state";

import { useVaultStore } from "../../estado/vaultStore";
import { useWorkspaceStore } from "../../estado/workspaceStore";
import { ehImagem, mimeDaImagem } from "../../vault/anexos";
import {
  embedComLargura,
  embedsNaLinha,
  larguraDoAlias,
  linhaSoDeEmbeds,
  mudancasParaMover,
  type DestinoImagem,
} from "./imagensNaLinha";

/** Menor largura que o arraste da alça deixa gravar (escala do doc 06). */
const LARGURA_MINIMA = 64;
/** Deslocamento que separa clique de arraste (mesmo limiar de moverBloco.ts). */
const LIMIAR_ARRASTE = 4;

// Uma leitura por arquivo+versão na sessão. A versão (mtime) entra na chave para a imagem
// trocada por fora aparecer atualizada.
const urls = new Map<string, Promise<string>>();
// Tamanho natural já visto: o <img> nasce com a proporção certa ao remontar (mesmo motivo do
// cache de `atomico/image-blocks.ts` — sem isto a linha cresce depois de carregar e a rolagem pula).
const dimensoes = new Map<string, { w: number; h: number }>();

function urlDaImagem(caminho: string, versao: number): Promise<string> {
  const chave = `${caminho}@${versao}`;
  let url = urls.get(chave);
  if (!url) {
    url = (async () => {
      const adapter = useVaultStore.getState().adapter;
      if (!adapter) throw new Error("Nenhum vault aberto.");
      const bytes = await adapter.lerBinario(caminho);
      return URL.createObjectURL(new Blob([bytes], { type: mimeDaImagem(caminho) }));
    })();
    url.catch(() => urls.delete(chave));
    urls.set(chave, url);
  }
  return url;
}

interface ItemImagem {
  caminho: string;
  versao: number;
  largura: number | null;
  /** Posição entre TODOS os embeds da linha (é o índice que `imagensNaLinha` usa). */
  indice: number;
}

/** Linha do documento onde está a fileira, lida do DOM na hora da ação (posições mudam). */
function linhaDaFileira(view: EditorView, fileira: HTMLElement): number | null {
  const pos = view.posAtDOM(fileira);
  if (pos < 0) return null;
  return view.state.doc.lineAt(pos).number;
}

// ——— arraste de imagem (juntar lado a lado / separar) ———

let indicador: HTMLDivElement | null = null;

function mostrarIndicador(x: number, y: number, largura: number, altura: number) {
  if (!indicador) {
    indicador = document.createElement("div");
    indicador.className = "cm-embed-imagem-soltura";
    document.body.appendChild(indicador);
  }
  Object.assign(indicador.style, {
    display: "block",
    left: `${x}px`,
    top: `${y}px`,
    width: `${largura}px`,
    height: `${altura}px`,
  });
}

function esconderIndicador() {
  if (indicador) indicador.style.display = "none";
}

/** Onde soltar, dado o ponteiro: ao lado de uma imagem desta vista, ou entre linhas. */
function destinoEm(view: EditorView, x: number, y: number): DestinoImagem | null {
  const sob = document.elementFromPoint(x, y);
  const item = sob?.closest<HTMLElement>(".cm-embed-imagem");
  if (item && view.dom.contains(item)) {
    const fileira = item.closest<HTMLElement>(".cm-embed-imagens");
    const linha = fileira ? linhaDaFileira(view, fileira) : null;
    if (linha === null) return null;
    const r = item.getBoundingClientRect();
    const lado = x < r.left + r.width / 2 ? "antes" : "depois";
    mostrarIndicador(lado === "antes" ? r.left - 5 : r.right + 3, r.top, 2, r.height);
    return { tipo: "lado", linha, indice: Number(item.dataset.indice), lado };
  }

  const conteudo = view.contentDOM.getBoundingClientRect();
  if (x < conteudo.left || x > conteudo.right || y < conteudo.top || y > conteudo.bottom) {
    esconderIndicador();
    return null;
  }
  const pos = view.posAtCoords({ x, y }, false);
  const bloco = view.lineBlockAtHeight(y - view.documentTop);
  const linha = view.state.doc.lineAt(pos).number;
  const posicao = y < view.documentTop + bloco.top + bloco.height / 2 ? "antes" : "depois";
  const yLinha = view.documentTop + (posicao === "antes" ? bloco.top : bloco.bottom) - 1;
  mostrarIndicador(conteudo.left, yLinha, conteudo.width, 2);
  return { tipo: "linha", linha, posicao };
}

function iniciarArrasteImagem(
  view: EditorView,
  item: HTMLElement,
  fileira: HTMLElement,
  indice: number,
  inicio: PointerEvent,
) {
  let arrastando = false;
  let destino: DestinoImagem | null = null;

  const terminar = () => {
    window.removeEventListener("pointermove", aoMover);
    window.removeEventListener("pointerup", aoSoltar);
    window.removeEventListener("keydown", aoTeclar, true);
    item.classList.remove("cm-embed-imagem-arrastando");
    esconderIndicador();
  };

  const aoMover = (e: PointerEvent) => {
    if (!arrastando) {
      if (Math.hypot(e.clientX - inicio.clientX, e.clientY - inicio.clientY) < LIMIAR_ARRASTE) return;
      arrastando = true;
      item.classList.add("cm-embed-imagem-arrastando");
    }
    destino = destinoEm(view, e.clientX, e.clientY);
  };

  const aoSoltar = () => {
    terminar();
    const linha = linhaDaFileira(view, fileira);
    if (!arrastando) {
      // Clique sem arraste: cursor no fim da linha do embed, que passa a mostrar o texto.
      if (linha === null) return;
      view.focus();
      view.dispatch({ selection: { anchor: view.state.doc.line(linha).to } });
      return;
    }
    if (linha === null || !destino) return;
    const mudancas = mudancasParaMover(view.state.doc, { linha, indice }, destino);
    if (mudancas) view.dispatch({ changes: mudancas, userEvent: "move" });
  };

  const aoTeclar = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    arrastando = false;
    destino = null;
    terminar();
  };

  window.addEventListener("pointermove", aoMover);
  window.addEventListener("pointerup", aoSoltar);
  window.addEventListener("keydown", aoTeclar, true);
}

// ——— alça de tamanho ———

function gravarLargura(view: EditorView, fileira: HTMLElement, indice: number, largura: number | null) {
  const numero = linhaDaFileira(view, fileira);
  if (numero === null) return;
  const linha = view.state.doc.line(numero);
  const embed = embedsNaLinha(linha.text)[indice];
  if (!embed) return;
  const novo = embedComLargura(embed.alvo, largura);
  if (linha.text.slice(embed.de, embed.ate) === novo) return;
  view.dispatch({
    changes: { from: linha.from + embed.de, to: linha.from + embed.ate, insert: novo },
    userEvent: "input",
  });
}

function iniciarRedimensionamento(
  view: EditorView,
  item: HTMLElement,
  img: HTMLImageElement,
  fileira: HTMLElement,
  indice: number,
  inicio: PointerEvent,
) {
  const larguraInicial = img.getBoundingClientRect().width;
  const maxima = fileira.getBoundingClientRect().width;
  let largura = larguraInicial;
  item.classList.add("cm-embed-imagem-redimensionando");

  const aoMover = (e: PointerEvent) => {
    largura = Math.min(maxima, Math.max(LARGURA_MINIMA, larguraInicial + e.clientX - inicio.clientX));
    img.style.width = `${largura}px`;
  };
  const aoSoltar = () => {
    window.removeEventListener("pointermove", aoMover);
    window.removeEventListener("pointerup", aoSoltar);
    item.classList.remove("cm-embed-imagem-redimensionando");
    if (Math.round(largura) !== Math.round(larguraInicial)) {
      gravarLargura(view, fileira, indice, largura);
    }
  };
  window.addEventListener("pointermove", aoMover);
  window.addEventListener("pointerup", aoSoltar);
}

class FileiraImagensWidget extends WidgetType {
  constructor(
    private readonly itens: ItemImagem[],
    private readonly editavel: boolean,
  ) {
    super();
  }

  eq(outro: FileiraImagensWidget): boolean {
    return (
      outro.editavel === this.editavel &&
      outro.itens.length === this.itens.length &&
      outro.itens.every((it, i) => {
        const meu = this.itens[i];
        return (
          it.caminho === meu.caminho &&
          it.versao === meu.versao &&
          it.largura === meu.largura &&
          it.indice === meu.indice
        );
      })
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const fileira = document.createElement("div");
    // `cm-atomic-image` dá o mesmo respiro e recorte das imagens markdown do editor (doc 06).
    fileira.className = "cm-atomic-image cm-embed-imagens";

    for (const it of this.itens) {
      const item = document.createElement("div");
      item.className = "cm-embed-imagem";
      item.dataset.indice = String(it.indice);

      const img = document.createElement("img");
      img.alt = it.caminho.slice(it.caminho.lastIndexOf("/") + 1);
      img.draggable = false;
      if (it.largura !== null) img.style.width = `${it.largura}px`;
      const chave = `${it.caminho}@${it.versao}`;
      const dim = dimensoes.get(chave);
      if (dim) {
        img.width = dim.w;
        img.height = dim.h;
      }
      img.addEventListener("load", () => {
        if (img.naturalWidth > 0) dimensoes.set(chave, { w: img.naturalWidth, h: img.naturalHeight });
      });
      item.appendChild(img);

      urlDaImagem(it.caminho, it.versao)
        .then((url) => {
          img.src = url;
        })
        .catch(() => {
          item.textContent = "Não foi possível carregar a imagem.";
        });

      if (this.editavel) {
        const alca = document.createElement("div");
        alca.className = "cm-embed-imagem-alca";
        alca.title = "Arraste para mudar o tamanho. Duplo clique volta ao tamanho original.";
        alca.addEventListener("pointerdown", (e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          iniciarRedimensionamento(view, item, img, fileira, it.indice, e);
        });
        alca.addEventListener("dblclick", (e) => {
          e.preventDefault();
          e.stopPropagation();
          gravarLargura(view, fileira, it.indice, null);
        });
        item.appendChild(alca);
      }

      item.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        if (this.editavel) {
          iniciarArrasteImagem(view, item, fileira, it.indice, e);
        }
      });
      fileira.appendChild(item);
    }
    return fileira;
  }

  ignoreEvent(): boolean {
    // Todo ponteiro dentro da fileira é nosso (arraste, alça, clique).
    return true;
  }
}

/** Linhas com cursor ou seleção — nelas o texto do embed fica visível. */
export function linhasAtivas(state: EditorState): Set<number> {
  const linhas = new Set<number>();
  for (const r of state.selection.ranges) {
    const ini = state.doc.lineAt(r.from).number;
    const fim = state.doc.lineAt(r.to).number;
    for (let n = ini; n <= fim; n++) linhas.add(n);
  }
  return linhas;
}

function construirDecoracoes(state: EditorState): DecorationSet {
  const vault = useVaultStore.getState();
  if (!vault.adapter) return Decoration.none;
  const origem = useWorkspaceStore.getState().caminhoAtivo ?? "";
  const ativas = linhasAtivas(state);
  const editavel = !state.readOnly;
  const ranges: Range<Decoration>[] = [];

  for (let n = 1; n <= state.doc.lines; n++) {
    const linha = state.doc.line(n);
    if (!linha.text.includes("![[")) continue;
    const embeds = embedsNaLinha(linha.text);
    const itens: ItemImagem[] = [];
    embeds.forEach((e, indice) => {
      const caminho = vault.resolver(e.alvo, origem);
      if (!caminho || !ehImagem(caminho)) return;
      const versao = vault.entradas.find((en) => en.path === caminho)?.mtimeMs ?? 0;
      itens.push({ caminho, versao, largura: larguraDoAlias(e.alias), indice });
    });
    if (itens.length === 0) continue;

    const widget = new FileiraImagensWidget(itens, editavel);
    // Trocar a linha pela fileira só quando ela é feita apenas de imagens: com texto junto ou
    // outro tipo de embed (um desenho, que tem o próprio widget), trocar esconderia o resto.
    const soImagens = itens.length === embeds.length && linhaSoDeEmbeds(linha.text, embeds);
    if (soImagens && !ativas.has(n)) {
      ranges.push(Decoration.replace({ widget, block: true }).range(linha.from, linha.to));
    } else {
      ranges.push(Decoration.widget({ widget, block: true, side: 1 }).range(linha.to));
    }
  }
  return Decoration.set(ranges, true);
}

/** Pede reconstrução quando o vault muda sem o documento mudar (imagem colada, índice pronto). */
const refrescar = StateEffect.define<null>();

export const embedImagemField = StateField.define<DecorationSet>({
  create: (state) => construirDecoracoes(state),
  update(deco, tr) {
    const pediuRefresco = tr.effects.some((e) => e.is(refrescar));
    if (pediuRefresco || tr.docChanged) return construirDecoracoes(tr.state);
    if (tr.selection) {
      // Só reconstrói se o cursor mudou de linha: andar dentro da linha não muda nada aqui.
      const antes = linhasAtivas(tr.startState);
      const depois = linhasAtivas(tr.state);
      const igual = antes.size === depois.size && [...antes].every((n) => depois.has(n));
      if (!igual) return construirDecoracoes(tr.state);
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const observadorDoVault = ViewPlugin.fromClass(
  class {
    private readonly cancelar: () => void;
    constructor(view: EditorView) {
      this.cancelar = useVaultStore.subscribe((s, anterior) => {
        if (s.resolucao !== anterior.resolucao || s.entradas !== anterior.entradas) {
          view.dispatch({ effects: refrescar.of(null) });
        }
      });
    }
    destroy() {
      this.cancelar();
    }
  },
);

export const embedImagem: Extension = [embedImagemField, observadorDoVault];
