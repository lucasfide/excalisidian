// Os dois idiomas do produto. Folha de dependências: nada importa daqui pra cima.
// Português do Brasil é a fonte da verdade dos textos (ver catalogo.ts); inglês é a
// tradução. Não há terceiro idioma previsto — quando houver, entra aqui e em CATALOGOS.

export type Idioma = "pt-BR" | "en";

export const IDIOMAS: readonly Idioma[] = ["pt-BR", "en"];

export function ehIdioma(v: unknown): v is Idioma {
  return typeof v === "string" && (IDIOMAS as readonly string[]).includes(v);
}

/** Escolhe o idioma a partir das tags BCP-47 do sistema (`navigator.languages`).
 * Qualquer variante de português serve pt-BR; o resto do mundo recebe inglês. */
export function idiomaDoSistema(tags: readonly string[] = []): Idioma {
  for (const tag of tags) {
    if (/^pt\b/i.test(tag)) return "pt-BR";
    if (/^en\b/i.test(tag)) return "en";
  }
  return "en";
}
