// Conteúdo de uma aba do dockview. Lê o caminho dos `params` (nunca o conteúdo — doc 05 §6),
// carrega o documento pelo documentosStore e monta o EditorNota. Cada aba tem seu próprio
// estado de edição e autosave.

import { useEffect } from "react";
import type { IDockviewPanelProps } from "dockview";

import { useDocumentosStore } from "../estado/documentosStore";
import EditorNota from "../editor/EditorNota";
import FaixaConflito from "../ui/excalisidian/FaixaConflito";

type Params = { path: string };

export default function PainelDocumento(props: IDockviewPanelProps<Params>) {
  const path = props.params.path;
  const abrir = useDocumentosStore((s) => s.abrir);
  const editar = useDocumentosStore((s) => s.editar);
  const salvar = useDocumentosStore((s) => s.salvar);
  const doc = useDocumentosStore((s) => s.docs.get(path));

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
    // `container-name: editor` mede a largura do PAINEL (não a da coluna de texto): é o que
    // a marginália consulta para colapsar de 76px para 24px abaixo de 760px (doc 06).
    <div className="flex h-full flex-col bg-papel [container-name:editor] [container-type:inline-size]">
      <FaixaConflito path={path} />
      {/* Coluna de 720px centralizada com padding lateral de 32px (doc 06, Layout).
          A marginália fica dentro dessa largura. */}
      <div className="mx-auto min-h-0 w-full max-w-[720px] flex-1 px-8 py-6">
        <EditorNota
          key={`${path}#${doc.versao}`}
          caminho={path}
          conteudoInicial={doc.conteudoEditor}
          onEditar={(t) => editar(path, t)}
          onBlur={() => void salvar(path)}
        />
      </div>
    </div>
  );
}
