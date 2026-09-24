// Nome do arquivo e H1 da nota são a mesma coisa (doc 04 §3.1). Editar o H1 na linha 1 e
// sair dela (não a cada tecla — ver docs/09) dispara um rename de verdade, com a mesma
// máquina de reescrita de backlinks de renomear.ts. A direção contrária (renomear pelo
// arquivo atualiza o H1) mora em src/vault/renomear.ts, não aqui.
//
// "Sair da linha 1" cobre só o cursor se mover dentro DESTE editor (`selectionSet`). Mas o
// usuário também sai da nota clicando em outra aba, outra nota na sidebar, ou fechando a
// aba — nenhum desses move a seleção deste editor. Por isso também disparamos ao perder o
// foco (`update.focusChanged`, com `view.hasFocus` false) e ao destruir o plugin
// (`destroy()`, quando a aba fecha). Não usamos `domEventHandlers` de blur porque
// `ViewUpdate.focusChanged` já chega pelo mesmo `update()` que trata seleção/edição — um
// event handler de DOM separado duplicaria o cálculo de "estava na linha 1" sem ganhar nada.
//
// Mesmo padrão de wikilinksExcalisidian.ts/embedDesenho.ts: a origem é a aba ativa
// (`workspaceStore.caminhoAtivo`), não um parâmetro por instância — `EditorNota.tsx` reusa
// um array de extensões só, fixo, entre todas as abas. Mas ler `caminhoAtivo` NO MOMENTO do
// blur/destroy é errado: ao perder o foco (clicar noutra aba) ou ao destruir (fechar a aba),
// a aba ativa já pode ser outra. Por isso capturamos `caminhoAtivo` só nos dois momentos em
// que ele com certeza ainda é o desta aba — ganhar foco, ou entrar na linha 1 — e usamos
// esse valor capturado no rename, nunca o `caminhoAtivo` lido na hora do próprio evento.

import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

import { useWorkspaceStore } from "../../estado/workspaceStore";
import { renomearArquivo } from "../../vault/renomear";
import { h1DaPrimeiraLinha } from "../../vault/tituloNota";

function linhaDoCursor(view: EditorView): number {
  return view.state.doc.lineAt(view.state.selection.main.head).number;
}

function h1Atual(view: EditorView): string | null {
  return h1DaPrimeiraLinha(view.state.doc.line(1).text);
}

/** Os três jeitos de disparar a decisão de renomear. */
export type EventoTitulo =
  | { tipo: "selecao"; naLinha1Antes: boolean; naLinha1Depois: boolean }
  | { tipo: "foco-perdido"; naLinha1: boolean }
  | { tipo: "destruicao"; naLinha1: boolean };

export interface DecisaoRenomear {
  renomear: boolean;
  caminho: string | null;
  titulo: string | null;
}

/**
 * Decide se o evento deve disparar um rename, e com quais dados — pura, sem ler nem gravar
 * nada. `titulo`: H1 atual da linha 1 (null se a linha 1 não é mais um H1 válido).
 * `ultimoTitulo`: último título já usado para renomear (ou o título com que o editor abriu,
 * antes do primeiro rename). `caminhoCapturado`: caminho da nota deste editor, capturado ao
 * ganhar foco ou entrar na linha 1 — null se isso nunca aconteceu.
 */
export function decidirRenomear(
  evento: EventoTitulo,
  titulo: string | null,
  ultimoTitulo: string | null,
  caminhoCapturado: string | null,
): DecisaoRenomear {
  const dispara =
    (evento.tipo === "selecao" && evento.naLinha1Antes && !evento.naLinha1Depois) ||
    (evento.tipo === "foco-perdido" && evento.naLinha1) ||
    (evento.tipo === "destruicao" && evento.naLinha1);

  if (!dispara) return { renomear: false, caminho: null, titulo: null };
  if (!caminhoCapturado) return { renomear: false, caminho: null, titulo: null };
  if (titulo === null || titulo.length === 0) return { renomear: false, caminho: null, titulo: null };
  if (titulo === ultimoTitulo) return { renomear: false, caminho: null, titulo: null };

  return { renomear: true, caminho: caminhoCapturado, titulo };
}

export const sincronizarTituloComArquivo = ViewPlugin.fromClass(
  class {
    naLinha1: boolean;
    ultimoTitulo: string | null;
    /** Caminho da nota deste editor, capturado enquanto ele com certeza está com o foco —
     * ver comentário do topo do arquivo. */
    caminhoCapturado: string | null;
    view: EditorView;

    constructor(view: EditorView) {
      this.view = view;
      this.naLinha1 = linhaDoCursor(view) === 1;
      this.ultimoTitulo = h1Atual(view);
      this.caminhoCapturado = useWorkspaceStore.getState().caminhoAtivo;
    }

    update(update: ViewUpdate) {
      this.view = update.view;
      if (!update.docChanged && !update.selectionSet && !update.focusChanged) return;
      const view = update.view;
      const naLinha1Antes = this.naLinha1;
      const agoraNaLinha1 = linhaDoCursor(view) === 1;

      // Recaptura o caminho só nos dois momentos em que ele com certeza é o desta aba.
      const ganhouFoco = update.focusChanged && view.hasFocus;
      const entrouNaLinha1 = !naLinha1Antes && agoraNaLinha1;
      if (ganhouFoco || entrouNaLinha1) {
        this.caminhoCapturado = useWorkspaceStore.getState().caminhoAtivo;
      }

      if (naLinha1Antes && !agoraNaLinha1) {
        this.aplicarDecisao({ tipo: "selecao", naLinha1Antes, naLinha1Depois: agoraNaLinha1 });
      } else if (update.focusChanged && !view.hasFocus) {
        this.aplicarDecisao({ tipo: "foco-perdido", naLinha1: naLinha1Antes });
      }

      this.naLinha1 = agoraNaLinha1;
    }

    destroy() {
      this.aplicarDecisao({ tipo: "destruicao", naLinha1: this.naLinha1 });
    }

    private aplicarDecisao(evento: EventoTitulo) {
      const titulo = h1Atual(this.view);
      const decisao = decidirRenomear(evento, titulo, this.ultimoTitulo, this.caminhoCapturado);
      if (decisao.renomear && decisao.titulo !== null && decisao.caminho !== null) {
        this.ultimoTitulo = decisao.titulo;
        void renomearArquivo(decisao.caminho, decisao.titulo);
      }
    }
  },
);
