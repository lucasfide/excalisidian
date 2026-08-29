// Editor de nota (Fatia 2): live preview inline estilo Obsidian.
//
// O motor de live preview é o @atomic-editor/editor 0.6.2, copiado para src/editor/atomico/
// (ver o LEIA-ME de lá). Desde a Fatia 4 o conteúdo por aba vive no documentosStore e a aba
// ativa no workspaceStore.

import { useRef } from "react";
import type { Extension } from "@codemirror/state";
import {
  AtomicCodeMirrorEditor,
  type AtomicCodeMirrorEditorHandle,
} from "./atomico";
import { ATOMIC_CODE_LANGUAGES } from "./atomico/code-languages";
import "./atomico/styles/inline-preview.css";
// Depois do CSS do pacote: mapeia --atomic-editor-* para os tokens do design system.
import "./atomico/tokens-excalisidian.css";
import { atalhosFormatacao } from "./extensoes/atalhosFormatacao";
import { wikilinksExcalisidian } from "./extensoes/wikilinksExcalisidian";

// A marginália (doc 06) está adiada: o gutter do CodeMirror não convive bem com a
// centralização de coluna do editor vendorizado. Fica para uma passada dedicada, com o
// código já pronto em extensoes/marginalia.ts. Ver a nota no ADR-10 do docs/09.

// Referência estável: o pacote captura `extensions` uma vez na montagem. As callbacks de
// wikilinks leem o estado do store em tempo de chamada, então continuam atuais.
const EXTENSOES: readonly Extension[] = [atalhosFormatacao, wikilinksExcalisidian];

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
        extensions={EXTENSOES}
      />
    </div>
  );
}
