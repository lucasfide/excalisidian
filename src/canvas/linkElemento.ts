// Wikilink guardado em `element.link` (doc 02 §"Element Links"). Separado do
// `EditorDesenho.tsx` para ser testável sem montar o Excalidraw.

import { analisarMiolo } from "../indice/wikilink";

/**
 * `[[Alvo]]` / `[[Alvo#sub|alias]]` guardado em `element.link` -> alvo, ou `null` se o link
 * não for um wikilink (URL externa: quem chama deixa o Excalidraw abrir do jeito nativo).
 */
export function alvoDeLinkWiki(link: string): string | null {
  const m = /^\[\[([^\][]+)\]\]$/.exec(link.trim());
  if (!m) return null;
  const { target, invalido } = analisarMiolo(m[1]);
  return invalido ? null : target;
}
