// Aba de desenho (.draw.md). Espelha PainelDocumento: lê só o caminho dos params, carrega o
// texto pelo documentosStore (agnóstico de tipo) e monta o EditorDesenho. Autosave e conflito
// seguem o mesmo contrato das notas.

import { useEffect } from "react";
import type { IDockviewPanelProps } from "dockview";

import { useDocumentosStore } from "../estado/documentosStore";
import EditorDesenho from "../canvas/EditorDesenho";
import FaixaConflito from "../ui/excalisidian/FaixaConflito";

type Params = { path: string };

export default function PainelDesenho(props: IDockviewPanelProps<Params>) {
  const path = props.params.path;
  const abrir = useDocumentosStore((s) => s.abrir);
  const editar = useDocumentosStore((s) => s.editar);
  const doc = useDocumentosStore((s) => s.docs.get(path));

  useEffect(() => {
    void abrir(path);
  }, [path, abrir]);

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
      <div className="min-h-0 flex-1">
        <EditorDesenho
          key={`${path}#${doc.versao}`}
          caminho={path}
          conteudoInicial={doc.conteudoEditor}
          versao={doc.versao}
          onEditar={(md) => editar(path, md)}
        />
      </div>
    </div>
  );
}
