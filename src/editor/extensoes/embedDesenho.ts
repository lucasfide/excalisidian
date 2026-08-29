// `![[Desenho.draw]]` na nota: renderiza o SVG do desenho no lugar da linha, com largura
// opcional (`![[Desenho.draw|400]]`), clique para abrir, e um guarda de auto-embed
// (Fatia 7, doc 08).
//
// O pacote vendorizado trata `![[...]]` exatamente como `[[...]]` — não reconhece o `!`. Esta
// é uma extensão CM6 própria, ao lado de `wikilinksExcalisidian.ts`, que reaproveita o mesmo
// parser de wikilink do índice (`extrairLinks`) para não divergir do que conta como embed.
//
// Sobre "referência circular" (critério do doc 08): nesta fatia, uma nota só embute um
// desenho, e renderizar um desenho é uma exportação estática (`exportToSvg`) que não expande
// mais nenhum embed dentro dele — não existe, portanto, um caminho de renderização que
// recurse de verdade. O guarda abaixo cobre o único caso hoje alcançável (o alvo resolvido
// ser o próprio arquivo aberto) e existe para não deixar a checagem ausente no dia em que um
// desenho ou uma nota puderem embutir outro conteúdo que reabra este componente.

import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

import { extrairLinks } from "../../indice/wikilink";
import { useVaultStore } from "../../estado/vaultStore";
import { useWorkspaceStore } from "../../estado/workspaceStore";
import { tipoDoArquivo } from "../../vault/arvore";
import { abrirOuCriarPorLink } from "../../vault/navegacao";
import { renderizarSvg } from "../../canvas/renderSvg";
import { temaEscuroAtivo } from "../../canvas/paletaCanvas";

class EmbedDesenhoWidget extends WidgetType {
  constructor(
    private readonly alvo: string,
    private readonly origem: string,
    private readonly largura: string | undefined,
    private readonly circular: boolean,
    // Entra na igualdade de propósito: sem isto, trocar o tema não recria o widget (o
    // CodeMirror reaproveita o DOM existente quando `eq()` diz que nada mudou) e o SVG
    // embutido continua mostrando as cores do tema anterior até fechar e reabrir a nota.
    private readonly escuro: boolean,
  ) {
    super();
  }

  eq(outro: EmbedDesenhoWidget): boolean {
    return (
      outro.alvo === this.alvo &&
      outro.largura === this.largura &&
      outro.circular === this.circular &&
      outro.escuro === this.escuro
    );
  }

  toDOM(): HTMLElement {
    const container = document.createElement("div");
    container.className = "cm-embed-desenho";
    if (this.largura) container.style.width = this.largura;

    if (this.circular) {
      container.classList.add("cm-embed-desenho-erro");
      container.textContent = `Referência circular: "${this.alvo}" já está embutido aqui.`;
      return container;
    }

    container.textContent = "Carregando desenho…";
    container.setAttribute("role", "button");
    container.tabIndex = 0;
    container.title = "Clique para abrir o desenho";

    void renderizarSvg(this.alvo)
      .then((svg) => {
        container.textContent = "";
        svg.classList.add("cm-embed-desenho-svg");
        container.appendChild(svg);
      })
      .catch(() => {
        container.textContent = "Não foi possível carregar o desenho.";
      });

    const abrir = (e: Event) => {
      e.preventDefault();
      void abrirOuCriarPorLink(this.alvo, this.origem);
    };
    container.addEventListener("mousedown", abrir);
    container.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Enter") abrir(e);
    });

    return container;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/** Largura opcional do alias: `|400` ou `|400x300` — só o primeiro número interessa aqui. */
function larguraDoAlias(alias: string | undefined): string | undefined {
  const m = alias ? /^(\d+)/.exec(alias) : null;
  return m ? `${m[1]}px` : undefined;
}

function construirDecoracoes(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const vault = useVaultStore.getState();
  const origem = useWorkspaceStore.getState().caminhoAtivo ?? "";
  if (!vault.adapter) return builder.finish();

  const texto = view.state.doc.toString();
  const embeds = extrairLinks(texto).filter((l) => l.embed);

  for (const link of embeds) {
    const alvo = vault.resolver(link.target, origem);
    if (!alvo || tipoDoArquivo(alvo) !== "drawing") continue;
    if (link.line > view.state.doc.lines) continue;

    const linha = view.state.doc.line(link.line);
    const widget = new EmbedDesenhoWidget(
      alvo,
      origem,
      larguraDoAlias(link.alias),
      alvo === origem, // auto-embed: um desenho não pode se embutir na própria nota
      temaEscuroAtivo(),
    );
    builder.add(
      linha.from,
      linha.to,
      Decoration.replace({ widget, block: true }),
    );
  }

  return builder.finish();
}

export const embedDesenho = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    private observador: MutationObserver | undefined;

    constructor(private readonly view: EditorView) {
      this.decorations = construirDecoracoes(view);

      // A troca de tema (App.tsx alterna a classe `dark` no <html>) não mexe no documento,
      // então `update()` abaixo nunca dispararia sozinho. Reconstrói as decorações (o `eq()`
      // do widget agora inclui `escuro`, então isso força um novo `toDOM()`/renderizarSvg) e
      // despacha uma transação vazia só para o CodeMirror repintar com o novo conjunto.
      if (typeof MutationObserver !== "undefined") {
        this.observador = new MutationObserver((mutations) => {
          for (const m of mutations) {
            if (m.type === "attributes" && m.attributeName === "class") {
              this.decorations = construirDecoracoes(this.view);
              this.view.dispatch({});
              return;
            }
          }
        });
        this.observador.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["class"],
        });
      }
    }

    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.decorations = construirDecoracoes(update.view);
      }
    }

    destroy() {
      this.observador?.disconnect();
    }
  },
  { decorations: (v) => v.decorations },
);
