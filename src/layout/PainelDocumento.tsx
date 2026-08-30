// Conteúdo de uma aba do dockview. Lê o caminho dos `params` (nunca o conteúdo — doc 05 §6),
// carrega o documento pelo documentosStore e monta o EditorNota. Cada aba tem seu próprio
// estado de edição e autosave.

import { useCallback, useEffect } from "react";
import type { IDockviewPanelProps } from "dockview";

import { useDocumentosStore } from "../estado/documentosStore";
import { usePrefsStore, type LarguraNota } from "../estado/prefsStore";
import EditorNota from "../editor/EditorNota";
import FaixaConflito from "../ui/excalisidian/FaixaConflito";
import LimiteDeErro from "../ui/excalisidian/LimiteDeErro";
import { cn } from "../ui";

type Params = { path: string; somenteLeitura?: boolean };

// Largura da coluna de texto (doc 06, Layout — preferência, tela de Configurações): `media`
// é 30% mais larga que o padrão original de 720px; `pequena`, 30% mais larga que o antigo
// padrão de 560px; `full` usa o painel quase inteiro, com a mesma margem lateral de 32px que
// as outras larguras já têm.
const LARGURA_COLUNA: Record<LarguraNota, string> = {
  pequena: "max-w-[728px]",
  media: "max-w-[936px]",
  full: "max-w-none",
};

export default function PainelDocumento(props: IDockviewPanelProps<Params>) {
  const path = props.params.path;
  const somenteLeitura = props.params.somenteLeitura ?? false;
  const abrir = useDocumentosStore((s) => s.abrir);
  const editar = useDocumentosStore((s) => s.editar);
  const salvar = useDocumentosStore((s) => s.salvar);
  const doc = useDocumentosStore((s) => s.docs.get(path));
  const larguraNota = usePrefsStore((s) => s.larguraNota);

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
      {/* Coluna centralizada com padding lateral de 32px; largura conforme a preferência
          (doc 06, Layout — pequena/média/full). */}
      <div className={cn("mx-auto min-h-0 w-full flex-1 px-8 py-6", LARGURA_COLUNA[larguraNota])}>
        <LimiteDeErro key={`${path}#${doc.versao}`}>
          <EditorNota
            caminho={path}
            conteudoInicial={doc.conteudoEditor}
            onEditar={aoEditar}
            onBlur={aoSair}
            somenteLeitura={somenteLeitura}
          />
        </LimiteDeErro>
      </div>
    </div>
  );
}
