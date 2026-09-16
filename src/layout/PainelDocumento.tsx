// Conteúdo de uma aba do dockview. Lê o caminho dos `params` (nunca o conteúdo — doc 05 §6),
// carrega o documento pelo documentosStore e monta o EditorNota. Cada aba tem seu próprio
// estado de edição e autosave.

import { useCallback, useEffect, useState } from "react";
import type { EditorView } from "@codemirror/view";
import type { IDockviewPanelProps } from "dockview";

import { useDocumentosStore } from "../estado/documentosStore";
import { usePrefsStore, type LarguraNota } from "../estado/prefsStore";
import EditorNota from "../editor/EditorNota";
import FaixaConflito from "../ui/excalisidian/FaixaConflito";
import BarraFlutuanteFormatacao from "../ui/excalisidian/BarraFlutuanteFormatacao";
import LimiteDeErro from "../ui/excalisidian/LimiteDeErro";

type Params = { path: string; somenteLeitura?: boolean };

// Largura da coluna de texto (doc 06, Layout — preferência, tela de Configurações): `media`
// é 30% mais larga que o padrão original de 720px; `pequena`, 30% mais larga que o antigo
// padrão de 560px; `full` usa o painel quase inteiro, com a mesma margem lateral de 32px que
// as outras larguras já têm. Só limita o texto (`--nota-largura-coluna`, lido em
// tokens-excalisidian.css) — o contêiner de scroll abaixo é sempre largura total do painel,
// senão a barra de rolagem fica presa na borda da coluna em vez da borda do painel.
const LARGURA_COLUNA: Record<LarguraNota, string | undefined> = {
  pequena: "728px",
  media: "936px",
  full: undefined,
};

export default function PainelDocumento(props: IDockviewPanelProps<Params>) {
  const path = props.params.path;
  const somenteLeitura = props.params.somenteLeitura ?? false;
  const abrir = useDocumentosStore((s) => s.abrir);
  const editar = useDocumentosStore((s) => s.editar);
  const salvar = useDocumentosStore((s) => s.salvar);
  const doc = useDocumentosStore((s) => s.docs.get(path));
  const larguraNota = usePrefsStore((s) => s.larguraNota);
  const barraAcoplada = usePrefsStore((s) => s.barraFormatacaoAcoplada);
  const [view, setView] = useState<EditorView | null>(null);

  // Mesma consistência de identidade estável do PainelDesenho.tsx — aqui o CodeMirror não é
  // sensível a isso do mesmo jeito que o Excalidraw, mas evita a mesma classe de bug.
  const aoEditar = useCallback((t: string) => editar(path, t), [path, editar]);
  const aoSair = useCallback(() => void salvar(path), [path, salvar]);

  useEffect(() => {
    void abrir(path);
  }, [path, abrir]);

  // Flush ao desmontar (fechar a aba já é tratado no aoRemoverPainel; isto cobre o
  // remount por mudança de layout).
  useEffect(() => {
    return () => {
      void useDocumentosStore.getState().salvar(path);
    };
  }, [path]);

  if (!doc) {
    return (
      <div className="flex h-full items-center justify-center bg-papel">
        <span className="meta text-tinta-suave">carregando…</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-papel">
      <FaixaConflito path={path} />
      {/* Este div é o contêiner de scroll (o `.cm-scroller` enche ele), então TODO padding
          lateral aqui empurra a barra de rolagem pra dentro na mesma medida — era isso que
          deixava a barra a 32px da borda do painel (14/09/2026). O respiro direito mudou pra
          dentro do scroller (`tokens-excalisidian.css`), onde não desloca a barra. O esquerdo
          continua aqui, FORA do `view.dom`, porque a alça de arrastar bloco mora nele
          (ZONA_RESPIRO_PX, moverBloco.ts). */}
      <div className="min-h-0 w-full flex-1 pl-8 py-6">
        <LimiteDeErro key={`${path}#${doc.versao}`}>
          <EditorNota
            caminho={path}
            conteudoInicial={doc.conteudoEditor}
            onEditar={aoEditar}
            onBlur={aoSair}
            somenteLeitura={somenteLeitura}
            larguraColuna={LARGURA_COLUNA[larguraNota]}
            aoMontarView={setView}
          />
        </LimiteDeErro>
      </div>
      {/* Barra de formatação acoplada (preferência do usuário): faixa ancorada embaixo da
          nota, com hairline e sem sombra, como toda superfície ancorada (doc 06). Na vista
          somente leitura não aparece, igual à flutuante. */}
      {barraAcoplada && !somenteLeitura && view && (
        <div className="flex shrink-0 justify-center border-t border-regua bg-superficie p-1">
          <BarraFlutuanteFormatacao view={view} modo="acoplada" />
        </div>
      )}
    </div>
  );
}
