/** Limite de uma observação durável curta, contado em code points. */
export const MAX_FATO_CHARS = 500;
/** Orçamento máximo da seção de memória no prompt, contado em unidades JS. */
export const ORCAMENTO_FATOS_PROMPT = 4800;

export function contarCodePoints(texto: string): number {
  return Array.from(texto).length;
}

/** Chave para igualdade textual exata, ignorando só caixa e espaçamento. */
export function normalizarFatoParaComparacao(texto: string): string {
  return texto.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}
