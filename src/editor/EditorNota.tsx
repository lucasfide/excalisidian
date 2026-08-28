// Editor de nota (Fatia 1): CodeMirror 6 com markdown básico, quebra de linha, histórico e
// os atalhos padrão. Live preview e a marginália entram na Fatia 2.
//
// O componente é não-controlado por dentro: recria o documento só quando `caminho` muda
// (troca de arquivo). Edições do usuário sobem por `onEditar`; o autosave é do pai.

import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, drawSelection } from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";

import { temaEditor, realceEditor } from "./extensoes/tema";

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
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onEditarRef = useRef(onEditar);
  const onBlurRef = useRef(onBlur);
  onEditarRef.current = onEditar;
  onBlurRef.current = onBlur;

  useEffect(() => {
    if (!hostRef.current) return;

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: conteudoInicial,
        extensions: [
          history(),
          drawSelection(),
          EditorView.lineWrapping,
          markdown(),
          temaEditor,
          realceEditor,
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onEditarRef.current(u.state.doc.toString());
          }),
          EditorView.domEventHandlers({
            blur: () => {
              onBlurRef.current();
              return false;
            },
          }),
        ],
      }),
    });
    viewRef.current = view;
    view.focus();

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Recria só ao trocar de arquivo. O conteúdo inicial é lido uma vez na criação.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caminho]);

  return <div ref={hostRef} className="h-full overflow-hidden" />;
}
