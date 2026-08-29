// Leitura do frontmatter YAML (`---\n...\n---`) sem `gray-matter`. `gray-matter` chama
// `Buffer.from()` na entrada (`lib/utils.js:toBuffer`) — API do Node que não existe no
// WebView2, e travava com `ReferenceError: Buffer is not defined` sempre que um `.draw.md`
// era aberto (`EditorDesenho.tsx` chama `parseDesenho` sem try/catch, ao contrário do
// `parser.ts`, que engolia o erro em silêncio — foi por isso que só o canvas quebrava).
//
// `js-yaml` é a lib que o próprio `gray-matter` usa por baixo para o miolo; aqui ela é usada
// direto, sem a camada que dependia de Buffer.

import { load } from "js-yaml";

export interface Frontmatter {
  data: Record<string, unknown>;
  /** Tudo depois do bloco de frontmatter, sem alterar. Ausência de frontmatter = o md inteiro. */
  conteudo: string;
  /** Quantas linhas o bloco ocupou (0 se não houver). */
  linhas: number;
}

const VAZIO = (md: string): Frontmatter => ({ data: {}, conteudo: md, linhas: 0 });

export function lerFrontmatter(md: string): Frontmatter {
  const todasLinhas = md.split("\n");
  if (todasLinhas[0]?.trim() !== "---") return VAZIO(md);

  let fechamento = -1;
  for (let i = 1; i < todasLinhas.length; i++) {
    if (todasLinhas[i].trim() === "---") {
      fechamento = i;
      break;
    }
  }
  if (fechamento === -1) return VAZIO(md);

  const miolo = todasLinhas.slice(1, fechamento).join("\n");
  const conteudo = todasLinhas.slice(fechamento + 1).join("\n");

  let data: Record<string, unknown> = {};
  try {
    const parseado = load(miolo);
    if (parseado && typeof parseado === "object" && !Array.isArray(parseado)) {
      data = parseado as Record<string, unknown>;
    }
  } catch {
    // YAML inválido: trata como sem frontmatter, nunca lança.
  }

  return { data, conteudo, linhas: fechamento + 1 };
}
