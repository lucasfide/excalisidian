// DIAGNÓSTICO TEMPORÁRIO — bug do painel de emoji do Windows (Win+.) inserindo de forma
// intermitente. Só existe pra decidir, com dado real, entre duas hipóteses concorrentes (ver o
// plano da sessão) antes de mexer em qualquer comportamento de verdade: repetir o erro de
// consertar sem instrumentar (já aconteceu duas vezes seguidas com a alça de mover bloco, nesta
// mesma sessão) não vale a pena de novo.
//
// `import.meta.env.DEV` garante que isto nunca entra no bundle de produção (o Vite elimina o
// bloco inteiro por dead-code elimination — confirmar com grep em dist/assets depois do build).
// Remover este arquivo (e a linha que o importa em EditorNota.tsx) assim que o console tiver
// dado a resposta.

import type { Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

const PREFIXO = "[diagnostico-emoji]";

function agora() {
  return performance.now().toFixed(1);
}

// Tudo construído DENTRO do ramo `true` do ternário, e cada chamada marcada `@__PURE__`: assim,
// quando o build de produção resolve `import.meta.env.DEV` pra `false` (Vite faz isso por
// substituição estática), o Terser consegue provar que o ramo inteiro é morto e eliminar até os
// fechamentos/strings de log — não só o array fica vazio, o código em si some do bundle.
// Confirmado com grep em dist/assets depois do build; ver o plano da sessão.
export const diagnosticoEmoji: Extension[] = import.meta.env.DEV
  ? [
      /* @__PURE__ */ EditorView.domEventHandlers({
        beforeinput(event) {
          console.log(
            PREFIXO,
            "beforeinput",
            "t=" + agora(),
            "inputType=" + event.inputType,
            "data=" + JSON.stringify(event.data),
            "isComposing=" + event.isComposing,
          );
          return false; // nunca intercepta — só observa
        },
        compositionstart(event) {
          console.log(PREFIXO, "compositionstart", "t=" + agora(), "data=" + JSON.stringify(event.data));
          return false;
        },
        compositionupdate(event) {
          console.log(PREFIXO, "compositionupdate", "t=" + agora(), "data=" + JSON.stringify(event.data));
          return false;
        },
        compositionend(event) {
          console.log(PREFIXO, "compositionend", "t=" + agora(), "data=" + JSON.stringify(event.data));
          return false;
        },
        focus() {
          console.log(PREFIXO, "focus (evento nativo de elemento)", "t=" + agora());
          return false;
        },
        blur() {
          console.log(PREFIXO, "blur (evento nativo de elemento)", "t=" + agora());
          return false;
        },
      }),
      /* @__PURE__ */ ViewPlugin.define(() => ({
        update(update: ViewUpdate) {
          // Só loga quando pelo menos uma dessas flags está ligada — evitar ruído de updates
          // completamente inertes (ex: measure puro sem nenhuma flag).
          const { docChanged, selectionSet, focusChanged, geometryChanged } = update;
          if (!docChanged && !selectionSet && !focusChanged && !geometryChanged) return;

          console.log(
            PREFIXO,
            "update",
            "t=" + agora(),
            "docChanged=" + docChanged,
            "selectionSet=" + selectionSet,
            "focusChanged=" + focusChanged,
            "geometryChanged=" + geometryChanged,
            "hasFocus=" + update.view.hasFocus,
            "docLength:" + update.startState.doc.length + "->" + update.state.doc.length,
          );
        },
      })),
    ]
  : [];
