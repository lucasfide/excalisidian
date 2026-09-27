// Atalhos de formatação inline (doc 06 / Fatia 2). Envolvem a seleção com o marcador
// markdown; sem seleção, inserem o par e deixam o cursor no meio. A lógica de fato mora em
// comandosMarkdown.ts — reusada aqui e pela barra flutuante (barraFlutuante.ts).
//
// A continuação de lista já vem do `markdownKeymap` do pacote — não é reimplementada aqui.

import { Prec } from "@codemirror/state";
import { keymap, type EditorView } from "@codemirror/view";

import { envolver, inserirLink } from "./comandosMarkdown";

const BINDINGS = [
  { key: "Mod-b", run: envolver("**") },
  { key: "Mod-i", run: envolver("*") },
  { key: "Mod-e", run: envolver("`") },
  { key: "Mod-Shift-x", run: envolver("~~") },
  { key: "Mod-Shift-h", run: envolver("==") },
  // RF2.11: Ctrl+K insere link. Antes não havia binding nenhum (glossário, 19/09/2026).
  { key: "Mod-k", run: inserirLink() },
] as const;

/** Teclas deste keymap — lidas pelo teste de deriva do glossário (catalogoAtalhos.test.ts). */
export const TECLAS_FORMATACAO: readonly string[] = BINDINGS.map((b) => b.key);

// Vista somente leitura (2ª vista do split, ADR-13) não formata: `envolver`/`inserirLink` não
// checam `readOnly` e despachariam a mudança mesmo assim. Devolver `false` deixa a tecla passar.
export const atalhosFormatacao = Prec.high(
  keymap.of(
    BINDINGS.map((b) => ({
      key: b.key,
      run: (view: EditorView) => !view.state.readOnly && b.run(view),
      preventDefault: true,
    })),
  ),
);
