/** Normaliza texto para busca: remove acentos e maiúsculas, coloca espaços entre modificadores. */
export function normalizarBusca(texto: string): string {
  // NFD: decomposição, remove diacríticos, minúscula, + vira espaço, colapsa espaços, trim
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Filtra itens por consulta (ignora acentos/caixa, permite pontuação). */
export function filtrarGlossario<T extends { descricao: string; grupo: string }>(
  itens: readonly T[],
  consulta: string,
  textoExtra: (item: T) => string,
): T[] {
  const consultaNormalizada = normalizarBusca(consulta);

  if (!consultaNormalizada) {
    return [...itens];
  }

  const palavras = consultaNormalizada.split(" ");

  return itens.filter((item) => {
    const texto = normalizarBusca(item.descricao + " " + item.grupo + " " + textoExtra(item));
    return palavras.every((p) => texto.includes(p));
  });
}
