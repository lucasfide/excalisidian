// Resolução de wikilink -> caminho (doc 02 §4). Puro e determinístico.
//
//   1. alvo já vem normalizado NFC e sem `#…`/`|…` (LinkRef.target).
//   2. se contém "/": caminho a partir da raiz; tenta exato, +".md", +".draw.md".
//   3. se não contém "/": índice basename -> [caminhos]. Cada desenho é registrado sob
//      "Nome.draw" e sob "Nome"; a nota vence o desenho no empate entre os dois tipos.
//      Vários candidatos: menor distância de pasta em relação à origem; empate restante:
//      ordem alfabética do caminho.
//   4. nada encontrado: link não resolvido.
//
// Comparação de nome é case-insensitive (Windows). A chave canônica é minúscula com "/".

import { tipoDoArquivo, type TipoNo } from "../vault/arvore";

type TipoArquivo = Exclude<TipoNo, "folder">;

const PRIORIDADE_TIPO: Record<TipoArquivo, number> = {
  note: 0,
  drawing: 1,
  attachment: 2,
};

function baseNome(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function pastaDe(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

/** Chaves de basename sob as quais um arquivo é encontrável por `[[nome]]`. */
function chavesBasename(path: string): string[] {
  const nome = baseNome(path).toLowerCase();
  if (nome.endsWith(".draw.md")) {
    const semMd = nome.slice(0, -3); // "nome.draw"
    const semTudo = nome.slice(0, -8); // "nome"
    return [semMd, semTudo];
  }
  if (nome.endsWith(".md")) return [nome.slice(0, -3)];
  return [nome]; // anexo: com extensão
}

export interface IndiceResolucao {
  /** caminho canônico (minúsculo) -> caminho real. */
  porCaminho: Map<string, string>;
  /** chave de basename (minúscula) -> caminhos reais. */
  porBasename: Map<string, string[]>;
}

export function construirIndiceResolucao(paths: string[]): IndiceResolucao {
  const porCaminho = new Map<string, string>();
  const porBasename = new Map<string, string[]>();

  for (const path of paths) {
    porCaminho.set(path.toLowerCase(), path);
    for (const chave of chavesBasename(path)) {
      const lista = porBasename.get(chave);
      if (lista) lista.push(path);
      else porBasename.set(chave, [path]);
    }
  }
  // Ordem estável dentro de cada basename, para o desempate alfabético ser determinístico.
  for (const lista of porBasename.values()) lista.sort();
  return { porCaminho, porBasename };
}

function distanciaPasta(origem: string, candidato: string): number {
  const po = pastaDe(origem);
  const pc = pastaDe(candidato);
  if (pc === po) return 0;
  if (pc === pastaDe(po)) return 1;
  return 2 + (pc === "" ? 0 : pc.split("/").length);
}

function escolherMelhor(
  candidatos: string[],
  origem: string,
  alvoPedeDesenho: boolean,
): string {
  let pool = candidatos;

  // "a nota vence o desenho": se o alvo não pediu ".draw" e há nota entre os candidatos,
  // descarta os desenhos.
  if (!alvoPedeDesenho) {
    const temNota = pool.some((p) => tipoDoArquivo(baseNome(p)) === "note");
    if (temNota) pool = pool.filter((p) => tipoDoArquivo(baseNome(p)) === "note");
  }

  return [...pool].sort((a, b) => {
    const ta = PRIORIDADE_TIPO[tipoDoArquivo(baseNome(a))];
    const tb = PRIORIDADE_TIPO[tipoDoArquivo(baseNome(b))];
    if (ta !== tb) return ta - tb;
    const da = distanciaPasta(origem, a);
    const db = distanciaPasta(origem, b);
    if (da !== db) return da - db;
    return a.localeCompare(b);
  })[0];
}

/**
 * Resolve um alvo de wikilink a partir do arquivo `origem`. Devolve o caminho real ou null.
 */
export function resolverLink(
  indice: IndiceResolucao,
  alvo: string,
  origem: string,
): string | null {
  if (alvo === "") return origem; // [[#Título]] — link na própria nota

  const alvoBaixo = alvo.toLowerCase();

  if (alvo.includes("/")) {
    for (const tentativa of [alvoBaixo, alvoBaixo + ".md", alvoBaixo + ".draw.md"]) {
      const achado = indice.porCaminho.get(tentativa);
      if (achado) return achado;
    }
    return null;
  }

  const alvoPedeDesenho = alvoBaixo.endsWith(".draw");
  const candidatos = indice.porBasename.get(alvoBaixo);
  if (!candidatos || candidatos.length === 0) return null;
  if (candidatos.length === 1) return candidatos[0];
  return escolherMelhor(candidatos, origem, alvoPedeDesenho);
}
