// Aba de desenho (.draw.md). Espelha PainelDocumento: lê só o caminho dos params, carrega o
// texto pelo documentosStore (agnóstico de tipo) e monta o EditorDesenho. Autosave e conflito
// seguem o mesmo contrato das notas.

import { useCallback, useEffect } from "react";
import type { IDockviewPanelProps } from "dockview";

import { useDocumentosStore } from "../estado/documentosStore";
import EditorDesenho from "../canvas/EditorDesenho";
import FaixaConflito from "../ui/excalisidian/FaixaConflito";
import LimiteDeErro from "../ui/excalisidian/LimiteDeErro";

type Params = { path: string; somenteLeitura?: boolean };

export default function PainelDesenho(props: IDockviewPanelProps<Params>) {
  const path = props.params.path;
  const somenteLeitura = props.params.somenteLeitura ?? false;
  const abrir = useDocumentosStore((s) => s.abrir);
  const editar = useDocumentosStore((s) => s.editar);
  const doc = useDocumentosStore((s) => s.docs.get(path));

  // Identidade estável: EditorDesenho passa isto pro Excalidraw (via onChange), e uma nova
  // função a cada render dispara o loop de "Maximum update depth exceeded" documentado em
  // src/canvas/EditorDesenho.tsx.
  const aoEditar = useCallback(
    (md: string) => editar(path, md),
    [path, editar],
  );

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
        <LimiteDeErro
          key={`${path}#${doc.versao}`}
          onFechar={() => props.api.close()}
        >
          <EditorDesenho
            caminho={path}
            conteudoInicial={doc.conteudoEditor}
            versao={doc.versao}
            onEditar={aoEditar}
            somenteLeitura={somenteLeitura}
          />
        </LimiteDeErro>
      </div>
    </div>
  );
}
