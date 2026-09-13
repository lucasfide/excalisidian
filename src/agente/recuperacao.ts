// Recuperação local (doc 11 §5.5): sem embeddings. Termos do diff → índice de busca
// (minisearchIndex) + vizinhos do grafo de links (backlinks/outlinks) → top-k notas
// relacionadas. O custo é 1 busca em memória e N leituras de arquivo no disco local.

import { buscarConteudo } from "../busca/minisearchIndex";

export interface NotaRelacionada {
  path: string;
  titulo: string;
  /** Trecho cru da nota (até 400 chars) usado enquanto não há resumo em cache. */
  trecho: string;
}

const MAX_RELACIONADAS = 5;
export const TRECHO_MAX_CHARS = 400;

// Stopwords mínimas do português — o suficiente para os termos-chave saírem substantivos.
const STOPWORDS = new Set(
  ("a o e de da do em um uma as os nos nas por para com sem sob sobre entre que quem " +
    "qual quais como quando onde porque pois mas mais menos muito muita vários várias " +
    "este esta isto esse isso aquele aquilo meu sua dele dela deles nós eu tu ele ela " +
    "ser estar ter haver foi era é são são está estão não sim já ainda também só").split(
    " ",
  ),
);

/** Palavras-chave de um texto: ≥4 letras, sem acento na chave, por frequência. */
export function palavrasChave(texto: string, max = 8): string[] {
  const contagem = new Map<string, number>();
  for (const bruto of texto.toLowerCase().split(/[^0-9a-zà-öø-ÿ]+/i)) {
    const palavra = bruto.normalize("NFC").replace(/[^a-zà-öø-ÿ]/g, "");
    if (palavra.length < 4 || STOPWORDS.has(palavra)) continue;
    contagem.set(palavra, (contagem.get(palavra) ?? 0) + 1);
  }
  return [...contagem.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, max)
    .map(([palavra]) => palavra);
}

export interface PedidoRecuperacao {
  caminhoAtual: string;
  termos: string[];
  lerTexto: (path: string) => Promise<string>;
  /** Vizinhos do grafo: backlinks + outlinks resolvidos da nota atual. */
  vizinhos: string[];
  tituloDe: (path: string) => string;
}

/**
 * Busca por conteúdo nos termos do diff; vizinhos do grafo entram na frente (quem aponta
 * para a nota já é contexto por definição). Nunca devolve a própria nota nem anexos.
 */
export async function recuperarNotasRelacionadas(
  p: PedidoRecuperacao,
): Promise<NotaRelacionada[]> {
  const saida: NotaRelacionada[] = [];
  const vistos = new Set<string>([p.caminhoAtual]);

  const empilhar = (path: string, titulo: string, trecho: string) => {
    if (vistos.has(path) || saida.length >= MAX_RELACIONADAS) return;
    vistos.add(path);
    saida.push({ path, titulo, trecho: trecho.slice(0, TRECHO_MAX_CHARS) });
  };

  // 1) vizinhos do grafo primeiro, com o texto lido para o trecho de contexto.
  for (const path of p.vizinhos) {
    if (path.endsWith(".md") && !vistos.has(path)) {
      let texto = "";
      try {
        texto = await p.lerTexto(path);
      } catch {
        texto = "";
      }
      empilhar(path, p.tituloDe(path), texto);
      if (saida.length >= MAX_RELACIONADAS) return saida;
    }
  }

  // 2) busca por conteúdo nos termos-chave do diff.
  if (p.termos.length > 0) {
    const resultados = await buscarConteudo(p.termos.join(" "), p.lerTexto);
    for (const r of resultados) {
      if (r.path === p.caminhoAtual) continue;
      empilhar(r.path, r.titulo, r.trechos[0]?.trecho ?? "");
      if (saida.length >= MAX_RELACIONADAS) break;
    }
  }

  return saida;
}
