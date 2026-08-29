// Sintaxe de markdown que o índice e a marginália precisam reconhecer do mesmo jeito.
//
// Existe porque os dois liam a mesma coisa com regexes próprios: se divergirem, a margem
// marca um `^id` que o índice não registrou (ou o contrário), e o link para o bloco não
// resolve. Fonte única.

/** Heading ATX: captura os `#` e o texto, tolerando os `#` de fechamento. */
export const RE_HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;

/** Id de bloco no fim da linha: letras latinas, números e hífen (doc 02 §5). */
export const RE_BLOCO_ID = /(?:^|\s)\^([A-Za-z0-9-]+)\s*$/;

/** Abertura ou fechamento de bloco de código cercado. */
export const RE_FENCE = /^(\s*)(`{3,}|~{3,})/;

/** Embed: `![[Alvo]]`, em qualquer lugar da linha. Basta um por linha para marcar `EMB`. */
export const RE_EMBED = /!\[\[([^\][]+)\]\]/;

/** Nível do heading (1–6), ou 0 se a linha não for heading. */
export function nivelDoHeading(linha: string): number {
  return RE_HEADING.exec(linha)?.[1].length ?? 0;
}

/** Id de bloco da linha, ou null. */
export function blockIdDaLinha(linha: string): string | null {
  return RE_BLOCO_ID.exec(linha)?.[1] ?? null;
}

/** True se a linha contém um embed (`![[...]]`) — para o marcador `EMB` da marginália. */
export function ehLinhaDeEmbed(linha: string): boolean {
  return RE_EMBED.test(linha);
}
