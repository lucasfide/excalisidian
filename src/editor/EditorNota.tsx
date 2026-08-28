// Editor de nota (Fatia 2): live preview inline estilo Obsidian.
//
// O motor de live preview é o @atomic-editor/editor 0.6.2, copiado para src/editor/atomico/
// (ver o LEIA-ME de lá). O contrato com o resto do app é o mesmo da Fatia 1, então
// useAutosave, vaultStore e BarraStatus seguem sem alteração.

import { useRef } from "react";
import {
  AtomicCodeMirrorEditor,
  type AtomicCodeMirrorEditorHandle,
} from "./atomico";
import { ATOMIC_CODE_LANGUAGES } from "./atomico/code-languages";
import "./atomico/styles/inline-preview.css";

interface Props {
  caminho: string;
  conteudoInicial: string;
  onEditar(texto: string): void;
  onBlur(): void;
}

export default function EditorNota({
  caminho,
  conteudoInicial,
  onEditar,
  onBlur,
}: Props) {
  const handleRef = useRef<AtomicCodeMirrorEditorHandle | null>(null);

  return (
    // O blur borbulha (focusout); serve para o flush do autosave ao sair do editor.
    <div className="h-full overflow-hidden" onBlur={onBlur}>
      <AtomicCodeMirrorEditor
        documentId={caminho}
        markdownSource={conteudoInicial}
        onMarkdownChange={onEditar}
        editorHandleRef={handleRef}
        codeLanguages={ATOMIC_CODE_LANGUAGES}
      />
    </div>
  );
}
