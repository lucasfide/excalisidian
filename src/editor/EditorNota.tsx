// Editor de nota (Fatia 2): live preview inline estilo Obsidian.
//
// O motor de live preview é o @atomic-editor/editor 0.6.2, copiado para src/editor/atomico/
// (ver o LEIA-ME de lá). Desde a Fatia 4 o conteúdo por aba vive no documentosStore e a aba
// ativa no workspaceStore.

import { useEffect, useRef, type CSSProperties } from "react";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  AtomicCodeMirrorEditor,
  type AtomicCodeMirrorEditorHandle,
} from "./atomico";
import { ATOMIC_CODE_LANGUAGES } from "./atomico/code-languages";
import { useRevelacaoStore } from "../estado/revelacaoStore";
import "./atomico/styles/inline-preview.css";
// Depois do CSS do pacote: mapeia --atomic-editor-* para os tokens do design system.
import "./atomico/tokens-excalisidian.css";
import { atalhosFormatacao } from "./extensoes/atalhosFormatacao";
import { wikilinksExcalisidian } from "./extensoes/wikilinksExcalisidian";
import { embedDesenho } from "./extensoes/embedDesenho";
import { embedImagem } from "./extensoes/embedImagem";
import { colarImagem } from "./extensoes/colarImagem";
import { sincronizarTituloComArquivo } from "./extensoes/sincronizarTituloComArquivo";
import { tituloSempreH1 } from "./extensoes/tituloSempreH1";
import { selecionarCorpoDaNota } from "./extensoes/selecionarCorpoDaNota";
import { barraFlutuante } from "./extensoes/barraFlutuante";
import { selecaoDeBloco } from "./extensoes/selecaoDeBloco";
import { tabelaMarkdown } from "./extensoes/tabelaMarkdown";
import { quebraDeBloco } from "./extensoes/quebraDeBloco";
import { moverBloco } from "./extensoes/moverBloco";
import { menuTabela } from "./extensoes/menuTabela";
import { diagnosticoEmoji } from "./extensoes/diagnosticoEmoji";
import { rastrearEditorAtivo } from "./editorAtivo";
import "./extensoes/embedDesenho.css";
import "./extensoes/embedImagem.css";
import "./extensoes/moverBloco.css";

// Referência estável: o pacote captura `extensions` uma vez na montagem. As callbacks de
// wikilinks leem o estado do store em tempo de chamada, então continuam atuais.
const EXTENSOES: readonly Extension[] = [
  atalhosFormatacao,
  wikilinksExcalisidian,
  embedDesenho,
  embedImagem,
  colarImagem,
  sincronizarTituloComArquivo,
  tituloSempreH1,
  selecionarCorpoDaNota,
  barraFlutuante,
  selecaoDeBloco,
  // `tabelaMarkdown` precisa vir antes de `quebraDeBloco` aqui: os dois têm keymap de Enter em
  // Prec.highest, e o desempate entre extensões do mesmo nível de precedência segue a ordem de
  // registro (ver o comentário no topo de tabelaMarkdown.ts) — sem isso, `quebraDeBloco` trataria
  // a linha `| a | b |` como parágrafo comum antes da conversão em tabela rodar.
  tabelaMarkdown,
  quebraDeBloco,
  moverBloco,
  menuTabela,
  rastrearEditorAtivo,
  // TEMPORÁRIO — diagnóstico do bug do painel de emoji do Windows (ver o plano da sessão).
  // Vazio fora de DEV; remover junto com diagnosticoEmoji.ts assim que o console tiver a resposta.
  diagnosticoEmoji,
];

interface Props {
  caminho: string;
  conteudoInicial: string;
  onEditar(texto: string): void;
  onBlur(): void;
  /** Segunda vista do mesmo arquivo aberta via split (doc 09): sem sincronização em tempo
   * real entre vistas, editar dos dois lados sobrescreve em silêncio — trava a edição aqui. */
  somenteLeitura?: boolean;
  /** Largura máxima da coluna de texto (doc 06, Layout — preferência pequena/média/full).
   * `undefined`/`"none"` deixa o texto ocupar toda a largura disponível. Repassada como
   * variável CSS pro wrapper: quem lê é `.cm-content` via `tokens-excalisidian.css`, não este
   * componente — o scroll continua acontecendo em largura total (ver nota lá). */
  larguraColuna?: string;
  /** Entrega a `EditorView` montada (e `null` ao desmontar) — a barra de formatação
   * acoplada vive fora do editor, no PainelDocumento, e precisa dela pra aplicar os comandos. */
  aoMontarView?(view: EditorView | null): void;
}

export default function EditorNota({
  caminho,
  conteudoInicial,
  onEditar,
  onBlur,
  somenteLeitura = false,
  larguraColuna,
  aoMontarView,
}: Props) {
  const handleRef = useRef<AtomicCodeMirrorEditorHandle | null>(null);

  // Revelação de trecho vinda da busca (doc 13 §2.2/§1.5): não usa `initialRevealText` —
  // este efeito cobre os dois casos (nota montando e nota já montada) com o mesmo código,
  // porque os efeitos do AtomicCodeMirrorEditor (filho) sempre comitam antes do efeito do
  // EditorNota (pai) na mesma passada de montagem, então `handleRef.current` já existe aqui
  // mesmo no primeiro render. Na nota já aberta, é a mudança de `pendente` no store que
  // dispara o efeito de novo. `consumir` zera o pedido, então um remonte (ex.: troca de
  // `doc.versao` em PainelDocumento) não revela de novo. Duas vistas do mesmo arquivo (split
  // somente leitura, doc 09 ADR): ambas reagem, mas `consumir` só devolve texto pra uma —
  // a que renderizar primeiro (a vista principal, antes do clone) —, então só ela revela.
  const pedidoPendente = useRevelacaoStore((s) => s.pendente);
  useEffect(() => {
    if (!pedidoPendente || pedidoPendente.path !== caminho) return;
    const texto = useRevelacaoStore.getState().consumir(caminho);
    if (texto) handleRef.current?.revealText(texto);
  }, [pedidoPendente, caminho]);

  // Os efeitos do AtomicCodeMirrorEditor (filho) rodam antes deste, então o handle já está
  // preenchido aqui. `caminho` na dependência: trocar de documento remonta a view.
  useEffect(() => {
    if (!aoMontarView) return;
    const dom = handleRef.current?.getContentDOM();
    aoMontarView(dom ? EditorView.findFromDOM(dom) : null);
    return () => aoMontarView(null);
  }, [aoMontarView, caminho]);

  return (
    // O blur borbulha (focusout); serve para o flush do autosave ao sair do editor. A barra de
    // rolagem é o `.cm-scroller` do CodeMirror, que enche este wrapper (largura total do
    // painel) — só o texto dentro dele é limitado pela largura da coluna, via CSS var.
    <div
      className="h-full overflow-hidden"
      style={{ "--nota-largura-coluna": larguraColuna } as CSSProperties}
      onBlur={onBlur}
    >
      <AtomicCodeMirrorEditor
        documentId={caminho}
        markdownSource={conteudoInicial}
        onMarkdownChange={onEditar}
        editorHandleRef={handleRef}
        codeLanguages={ATOMIC_CODE_LANGUAGES}
        extensions={EXTENSOES}
        readOnly={somenteLeitura}
      />
    </div>
  );
}
