// markdown -> FileMeta (doc 02 §6). Puro e testável: recebe o texto e os metadados de
// disco, devolve o FileMeta. Não toca em disco nem resolve links (isso é resolucao.ts).

import matter from "gray-matter";

import { extrairLinks, type LinkRef } from "./wikilink";
import { RE_HEADING, RE_BLOCO_ID, RE_FENCE } from "./sintaxe";
import { tipoDoArquivo } from "../vault/arvore";

export type TipoArquivo = "note" | "drawing" | "attachment";

export interface Heading {
  text: string;
  level: number;
  line: number;
}

export interface FileMeta {
  /** Caminho relativo à raiz, com "/", NFC. */
  path: string;
  kind: TipoArquivo;
  mtimeMs: number;
  size: number;
  /** Heading 1 se houver, senão o basename sem extensão. */
  title: string;
  aliases: string[];
  headings: Heading[];
  blockIds: string[];
  outLinks: LinkRef[];
  embeds: LinkRef[];
}

function basenameSemExtensao(path: string): string {
  const nome = path.slice(path.lastIndexOf("/") + 1);
  if (nome.toLowerCase().endsWith(".draw.md")) return nome.slice(0, -8);
  const ponto = nome.lastIndexOf(".");
  return ponto > 0 ? nome.slice(0, ponto) : nome;
}

function extrairAliases(data: Record<string, unknown>): string[] {
  const a = data.aliases ?? data.alias;
  if (Array.isArray(a)) return a.map((x) => String(x).normalize("NFC"));
  if (typeof a === "string") {
    return a
      .split(",")
      .map((s) => s.trim().normalize("NFC"))
      .filter(Boolean);
  }
  return [];
}

/** Quantas linhas o bloco de frontmatter ocupa (0 se não houver). */
function linhasDeFrontmatter(texto: string): number {
  if (!texto.startsWith("---")) return 0;
  const linhas = texto.split("\n");
  if (linhas[0].trim() !== "---") return 0;
  for (let i = 1; i < linhas.length; i++) {
    if (linhas[i].trim() === "---") return i + 1;
  }
  return 0;
}

export function parsearNota(
  path: string,
  texto: string,
  disco: { mtimeMs: number; size: number },
): FileMeta {
  const kind = tipoDoArquivo(path);

  let data: Record<string, unknown> = {};
  try {
    data = matter(texto).data as Record<string, unknown>;
  } catch {
    // frontmatter inválido: ignora, trata como sem frontmatter
  }
  const aliases = extrairAliases(data);

  const inicioCorpo = linhasDeFrontmatter(texto);
  const linhas = texto.split("\n");

  const headings: Heading[] = [];
  const blockIds: string[] = [];
  let dentroDeFence = false;
  let marcadorFence = "";

  // Num .draw.md o corpo inteiro é o bloco de dados dentro de `%%…%%`: as linhas
  // `## Text Elements`, `## Scene` etc. e os `^tx-…` são estrutura do formato, não
  // headings/blockIds de navegação. Os wikilinks, esses sim, contam (backlinks de
  // desenho "de graça" — doc 02 §3.3).
  const coletarEstrutura = kind !== "drawing";

  for (let i = inicioCorpo; coletarEstrutura && i < linhas.length; i++) {
    const linha = linhas[i];

    const fence = RE_FENCE.exec(linha);
    if (fence) {
      if (!dentroDeFence) {
        dentroDeFence = true;
        marcadorFence = fence[2][0];
      } else if (fence[2][0] === marcadorFence) {
        dentroDeFence = false;
      }
      continue;
    }
    if (dentroDeFence) continue;

    const h = RE_HEADING.exec(linha);
    if (h) {
      headings.push({
        level: h[1].length,
        text: h[2].trim(),
        line: i + 1,
      });
      continue;
    }

    const b = RE_BLOCO_ID.exec(linha);
    if (b) blockIds.push(b[1]);
  }

  const todos = extrairLinks(texto);
  const outLinks = todos.filter((l) => !l.embed);
  const embeds = todos.filter((l) => l.embed);

  const h1 = coletarEstrutura ? headings.find((h) => h.level === 1) : undefined;
  const title = h1 ? h1.text : basenameSemExtensao(path);

  return {
    path,
    kind,
    mtimeMs: disco.mtimeMs,
    size: disco.size,
    title,
    aliases,
    headings,
    blockIds,
    outLinks,
    embeds,
  };
}
