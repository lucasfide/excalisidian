// Conteúdo de uma aba do dockview. Lê o caminho dos `params` (nunca o conteúdo — doc 05 §6),
// carrega o documento pelo documentosStore e monta o EditorNota. Cada aba tem seu próprio
// estado de edição e autosave.

import { useEffect } from "react";
import type { IDockviewPanelProps } from "dockview";

import { useDocumentosStore } from "../estado/documentosStore";
import EditorNota from "../editor/EditorNota";

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

  if (doc.estado === "orfao") {
    return (
      <div className="flex h-full items-center justify-center bg-papel px-8">
        <div className="max-w-md border-y border-bordo py-8">
          <h2 className="font-display text-[19px] text-bordo">
            Este arquivo não existe mais no disco.
          </h2>
          <p className="mt-2 text-pequeno text-tinta-media">{doc.erro}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-papel">
      <div className="mx-auto h-full max-w-[720px] px-8 py-6">
        <EditorNota
          key={`${path}#${doc.versao}`}
          caminho={path}
          conteudoInicial={doc.conteudoDisco}
          onEditar={(t) => editar(path, t)}
          onBlur={() => void salvar(path)}
        />
      </div>
    </div>
  );
}
