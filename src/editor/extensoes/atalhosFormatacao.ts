// Atalhos de formatação inline (doc 06 / Fatia 2). Envolvem a seleção com o marcador
// markdown; sem seleção, inserem o par e deixam o cursor no meio. A lógica de fato mora em
// comandosMarkdown.ts — reusada aqui e pela barra flutuante (barraFlutuante.ts).
//
// A continuação de lista já vem do `markdownKeymap` do pacote — não é reimplementada aqui.

import { Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";

import { envolver } from "./comandosMarkdown";

export const atalhosFormatacao = Prec.high(
  keymap.of([
    { key: "Mod-b", run: envolver("**"), preventDefault: true },
    { key: "Mod-i", run: envolver("*"), preventDefault: true },
    { key: "Mod-e", run: envolver("`"), preventDefault: true },
    { key: "Mod-Shift-x", run: envolver("~~"), preventDefault: true },
    { key: "Mod-Shift-h", run: envolver("=="), preventDefault: true },
  ]),
);
