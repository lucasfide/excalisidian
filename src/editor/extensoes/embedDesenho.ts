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
//
// Decorações de BLOCO vêm de um StateField, nunca de ViewPlugin: o CodeMirror rejeita
// `block: true` fornecido por plugin com `RangeError("Block decorations may not be
// specified via plugins")` — formato que quebrava o embed inteiro em tela (auditoria 12/09,
// achado 10; o precedente no projeto é `atomico/image-blocks.ts`, que faz o mesmo). O
// ViewPlugin que sobra só observa a troca de tema no `<html>` e manda um efeito pedindo
// re-construção; não fornece decoração nenhuma.

import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  WidgetType,
  type ViewUpdate,
} from "@codemirror/view";
import {
  RangeSetBuilder,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
} from "@codemirror/state";

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

function construirDecoracoes(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const vault = useVaultStore.getState();
  const origem = useWorkspaceStore.getState().caminhoAtivo ?? "";
  if (!vault.adapter) return builder.finish();

  const texto = state.doc.toString();
  const embeds = extrairLinks(texto).filter((l) => l.embed);

  for (const link of embeds) {
    const alvo = vault.resolver(link.target, origem);
    if (!alvo || tipoDoArquivo(alvo) !== "drawing") continue;
    if (link.line > state.doc.lines) continue;

    const linha = state.doc.line(link.line);
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

/** Efeito que pede a re-construção das decorações; disparado na troca de tema. */
const refrescarEmbeds = StateEffect.define<null>();

// Exportado só para o teste de regressão do achado 10 ler as decorações direto do estado.
export const embedDesenhoField = StateField.define<DecorationSet>({
  create: (state) => construirDecoracoes(state),
  update(deco, tr) {
    // Troca de tema: o `eq()` do widget inclui `escuro`, mas o documento não mudou, então
    // só reconstruímos quando o observador abaixo avisa — não a cada transação.
    for (const e of tr.effects) if (e.is(refrescarEmbeds)) return construirDecoracoes(tr.state);
    if (tr.docChanged) return construirDecoracoes(tr.state);
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/**
 * A troca de tema (App.tsx alterna a classe `dark` no `<html>`) não mexe no documento,
 * então o StateField acima nunca seria re-computado sozinho. Este ViewPlugin só observa o
 * atributo `class` e despacha `refrescarEmbeds` — sem fornecer decorações (não pode: são
 * de bloco). `view.dispatch({})` não bastaria: sem efeito nem mudança, o CodeMirror ignora.
 */
const observadorDeTema = ViewPlugin.fromClass(
  class {
    private observador: MutationObserver | undefined;

    constructor(private readonly view: EditorView) {
      if (typeof MutationObserver !== "undefined") {
        this.observador = new MutationObserver((mutations) => {
          for (const m of mutations) {
            if (m.type === "attributes" && m.attributeName === "class") {
              this.view.dispatch({ effects: refrescarEmbeds.of(null) });
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

    update(_update: ViewUpdate): void {}

    destroy() {
      this.observador?.disconnect();
    }
  },
);

export const embedDesenho: Extension = [embedDesenhoField, observadorDeTema];
