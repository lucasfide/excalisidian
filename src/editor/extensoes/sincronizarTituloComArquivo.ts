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
//
// A linha 1 também muda de texto por gente que não é o usuário digitando: renomear a nota
// pela sidebar reescreve o H1 e recarrega o editor (`renomearArquivo` → `recarregarDoDisco`),
// resolução de conflito faz o mesmo, e um `docChanged` assim NÃO é "o usuário editou o
// título" — o arquivo já está em sincronia com esse H1 novo (foi o próprio rename que o
// escreveu). Se tratássemos isso como edição, o próximo blur/destroy chamaria
// `renomearArquivo` com o `caminhoCapturado` ANTIGO (o rename pela sidebar já trocou o
// caminho) e um título que já é o do arquivo — regravando por cima de um caminho que não
// existe mais. Por isso só armamos `editouTitulo` quando a transação que mudou a linha 1 tem
// um `userEvent` de edição de verdade (`Transaction.isUserEvent` com os prefixos abaixo);
// uma mudança de linha 1 sem esse evento apenas resincroniza `ultimoTitulo` e zera
// `editouTitulo` — não é diff pendente, não há o que renomear.

import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

import { useWorkspaceStore } from "../../estado/workspaceStore";
import { renomearArquivo } from "../../vault/renomear";
import { h1DaPrimeiraLinha } from "../../vault/tituloNota";
import { toast } from "sonner";

/** Prefixos de `userEvent` (doc do CM6) que contam como "o usuário editou": digitar,
 * apagar, desfazer/refazer, mover conteúdo por drag-and-drop. `select`/`select.pointer` fica
 * de fora de propósito — mover o cursor não é editar o título. */
const PREFIXOS_EVENTO_USUARIO = ["input", "delete", "undo", "redo", "move"];

function transacaoDeUsuario(update: ViewUpdate): boolean {
  return update.transactions.some((tr) =>
    PREFIXOS_EVENTO_USUARIO.some((p) => tr.isUserEvent(p)),
  );
}

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
 * antes do primeiro rename, ou o título com que a linha 1 foi resincronizada por uma
 * mudança externa — ver `transacaoDeUsuario`). `caminhoCapturado`: caminho da nota deste
 * editor, capturado ao ganhar foco ou entrar na linha 1 — null se isso nunca aconteceu.
 * `editouTitulo`: true só quando a linha 1 mudou por uma edição de verdade do usuário desde
 * a última sincronização — false quando a única mudança pendente veio de fora (rename pela
 * sidebar, recarga do disco, resolução de conflito): nesses casos o arquivo já está com o
 * H1 novo, não há o que renomear.
 */
export function decidirRenomear(
  evento: EventoTitulo,
  titulo: string | null,
  ultimoTitulo: string | null,
  caminhoCapturado: string | null,
  editouTitulo: boolean,
): DecisaoRenomear {
  const dispara =
    (evento.tipo === "selecao" && evento.naLinha1Antes && !evento.naLinha1Depois) ||
    (evento.tipo === "foco-perdido" && evento.naLinha1) ||
    (evento.tipo === "destruicao" && evento.naLinha1);

  if (!dispara) return { renomear: false, caminho: null, titulo: null };
  if (!editouTitulo) return { renomear: false, caminho: null, titulo: null };
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
    /** True só quando a linha 1 mudou por edição de verdade do usuário desde a última
     * sincronização — ver comentário do topo do arquivo e `transacaoDeUsuario`. */
    editouTitulo: boolean;
    view: EditorView;

    constructor(view: EditorView) {
      this.view = view;
      this.naLinha1 = linhaDoCursor(view) === 1;
      this.ultimoTitulo = h1Atual(view);
      this.caminhoCapturado = useWorkspaceStore.getState().caminhoAtivo;
      this.editouTitulo = false;
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

      // A linha 1 pode ter mudado de texto sem o cursor ter saído dela (digitando) e sem
      // seleção nenhuma (recarga externa). Se o texto realmente mudou, decide se foi o
      // usuário editando ou uma mudança de fora — ver comentário do topo do arquivo.
      if (update.docChanged) {
        const linha1Antes = update.startState.doc.line(1).text;
        const linha1Depois = view.state.doc.line(1).text;
        if (linha1Antes !== linha1Depois) {
          if (transacaoDeUsuario(update)) {
            this.editouTitulo = true;
          } else {
            // Mudança externa (rename pela sidebar, recarga do disco, resolução de
            // conflito...): o arquivo já está em sincronia com esse H1 — não recaptura o
            // caminho aqui, só resincroniza `ultimoTitulo` e zera o que estava pendente.
            this.ultimoTitulo = h1Atual(view);
            this.editouTitulo = false;
          }
        }
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
      const decisao = decidirRenomear(
        evento,
        titulo,
        this.ultimoTitulo,
        this.caminhoCapturado,
        this.editouTitulo,
      );
      if (decisao.renomear && decisao.titulo !== null && decisao.caminho !== null) {
        this.ultimoTitulo = decisao.titulo;
        this.editouTitulo = false;
        renomearArquivo(decisao.caminho, decisao.titulo)
          .then((r) => {
            if (!r.ok) toast.error(r.motivo ?? "Não foi possível renomear.");
          })
          .catch((e: unknown) => {
            toast.error(e instanceof Error ? e.message : "Não foi possível renomear.");
          });
      }
    }
  },
);
