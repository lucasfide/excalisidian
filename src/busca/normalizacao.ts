// Dobra (fold) de texto para comparação sem acento e sem caixa (doc 13 §2.1). Usado tanto
// no índice de conteúdo (processTerm do MiniSearch) quanto na busca de títulos, para que
// "reuniao" ache "Reunião" nos dois motores com a mesma regra.
//
// Preserva o comprimento em UTF-16 para texto de entrada em NFC: cada caractere acentuado
// precomposto (ex.: "ã" = 1 unidade UTF-16) decompõe em NFD como base + marca combinante
// (2 code points) e, ao remover a marca, volta a 1 — o índice de cada caractere do texto
// dobrado bate com o do texto original. Isso é o que permite ao destaque (`partesComDestaque`)
// recortar o texto ORIGINAL usando posições achadas no texto dobrado. Emoji e texto sem
// acento não têm marca combinante a remover, então passam direto.
export function dobrar(texto: string): string {
  return texto
    .normalize("NFC")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}
