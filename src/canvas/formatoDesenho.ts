// Parse e serialize do formato .draw.md (doc 02 §3). É a peça mais frágil do produto
// (ADR-1): todo o escaping e a ordem estável moram aqui, e os testes 1/2/8/9 do doc 05 §10
// existem para guardá-la.
//
// Estrutura do arquivo:
//
//   ---
//   excalisidian: drawing
//   ---
//   <verso: markdown livre do usuário, preservado byte a byte>
//   %%
//   # Excalisidian Drawing
//
//   ## Text Elements
//   <corpo indentado 2 espaços> ^<blockId>   (registros separados por linha em branco vazia)
//
//   ## Element Links
//   <id do elemento>: [[link]]
//
//   ## Embedded Files
//   <fileId do Excalidraw>: [[anexos/img.png]]
//
//   ## Scene
//   ```draw-json
//   { JSON indentado, chaves em ordem alfabética }
//   ```
//   %%

import matter from "gray-matter";
import { compressToBase64, decompressFromBase64 } from "lz-string";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";

import { CHAVE_FRONTMATTER_DESENHO } from "../app/constantes";

export interface CenaDesenho {
  elements: ExcalidrawElement[];
  appState: Partial<AppState>;
}

export interface DadosDesenho {
  frontmatter: Record<string, unknown>;
  /** Markdown livre entre o frontmatter e o `%%` de abertura. Preservado byte a byte. */
  verso: string;
  /** blockId -> texto do elemento de texto. */
  textElements: Map<string, string>;
  /** id do elemento -> link (elementos não-texto com link). */
  elementLinks: Map<string, string>;
  /** fileId do Excalidraw -> `[[caminho]]` da imagem no vault. */
  embeddedFiles: Map<string, string>;
  cena: CenaDesenho;
}

const ZWSP = "​";
const CABECALHO = "# Excalisidian Drawing";
const FONTE_CENA = "excalisidian/0.1.0";
const VERSAO_CENA = 2;
/** Acima disto (bytes de JSON) grava a cena comprimida (doc 02 §3, item 7). */
export const LIMIAR_LZ = 1_500_000;
/** Campos que mudam a cada interação sem mudança semântica (doc 02 §3.3). */
const CAMPOS_VOLATEIS = ["version", "versionNonce", "updated", "isDeleted"] as const;

// --- blockId a partir do id do elemento (doc 02 §3.1) ------------------------------------

const PREFIXO_TIPO: Record<string, string> = {
  text: "tx",
  rectangle: "rc",
  diamond: "di",
  ellipse: "el",
  arrow: "ar",
  line: "ln",
  freedraw: "fd",
  image: "im",
  frame: "fr",
};

function prefixoDe(tipo: string): string {
  return PREFIXO_TIPO[tipo] ?? "el";
}

/** Troca `_` por `-` (block id do markdown não aceita `_`) e corta em 10 caracteres. */
function sanitizarId(id: string): string {
  return id.replace(/_/g, "-").slice(0, 10);
}

/**
 * Mapa `id do elemento -> blockId`, resolvendo colisões com sufixo `-2`, `-3`… atribuído
 * na ordem do array de elementos. Estável entre gravações se a cena não mudou.
 */
export function blockIdsDaCena(
  elements: ReadonlyArray<{ id: string; type: string }>,
): Map<string, string> {
  const contagem = new Map<string, number>();
  const mapa = new Map<string, string>();
  for (const el of elements) {
    const base = `${prefixoDe(el.type)}-${sanitizarId(el.id)}`;
    const n = (contagem.get(base) ?? 0) + 1;
    contagem.set(base, n);
    mapa.set(el.id, n === 1 ? base : `${base}-${n}`);
  }
  return mapa;
}

// --- JSON estável -----------------------------------------------------------------------

function ordenarChaves(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(ordenarChaves);
  if (v && typeof v === "object") {
    const saida: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      saida[k] = ordenarChaves((v as Record<string, unknown>)[k]);
    }
    return saida;
  }
  return v;
}

function jsonEstavel(v: unknown): string {
  return JSON.stringify(ordenarChaves(v), null, 2);
}

/** Cerca de crases com uma a mais que a maior sequência presente em `s` (mínimo 3). */
function cercaPara(s: string): string {
  let maior = 0;
  let atual = 0;
  for (const c of s) {
    if (c === "`") {
      atual += 1;
      if (atual > maior) maior = atual;
    } else {
      atual = 0;
    }
  }
  return "`".repeat(Math.max(3, maior + 1));
}

// --- escaping do corpo de Text Elements (doc 02 §3.2) ----------------------------------

function escaparTexto(t: string): string {
  return t.split("%%").join(`%${ZWSP}%`);
}

function desescaparTexto(t: string): string {
  return t.split(`%${ZWSP}%`).join("%%");
}

function indentarRegistro(texto: string, blockId: string): string {
  const linhas = texto.split("\n").map((l) => `  ${l}`);
  linhas[linhas.length - 1] = `${linhas[linhas.length - 1]} ^${blockId}`;
  return linhas.join("\n");
}

// --- serialize ------------------------------------------------------------------------------

function emitirValorYaml(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map((x) => String(x)).join(", ")}]`;
  return String(v);
}

function emitirFrontmatter(fm: Record<string, unknown>): string {
  const dados: Record<string, unknown> = {
    ...fm,
    [CHAVE_FRONTMATTER_DESENHO]: "drawing",
  };
  const linhas = Object.keys(dados)
    .sort()
    .map((k) => `${k}: ${emitirValorYaml(dados[k])}`);
  return `---\n${linhas.join("\n")}\n---\n`;
}

function limparElemento(el: ExcalidrawElement): Record<string, unknown> {
  const copia: Record<string, unknown> = { ...(el as Record<string, unknown>) };
  for (const campo of CAMPOS_VOLATEIS) delete copia[campo];
  return copia;
}

export function serializarDesenho(dados: DadosDesenho): string {
  const elementosVivos = dados.cena.elements.filter(
    (e) => !(e as { isDeleted?: boolean }).isDeleted,
  );

  const cenaObj = {
    type: "excalidraw",
    version: VERSAO_CENA,
    source: FONTE_CENA,
    elements: elementosVivos.map(limparElemento),
    appState: dados.cena.appState,
    files: {},
  };
  const json = jsonEstavel(cenaObj);

  let corpoCena: string;
  if (json.length > LIMIAR_LZ) {
    const comprimido = compressToBase64(json);
    const linhas = comprimido.match(/.{1,256}/g) ?? [comprimido];
    corpoCena = `\`\`\`draw-json-lz\n${linhas.join("\n")}\n\`\`\``;
  } else {
    const cerca = cercaPara(json);
    corpoCena = `${cerca}draw-json\n${json}\n${cerca}`;
  }

  const idPorElemento = blockIdsDaCena(elementosVivos);
  const registrosTexto = elementosVivos
    .filter((e) => e.type === "text")
    .map((e) => {
      const bid = idPorElemento.get(e.id)!;
      const texto = escaparTexto((e as { text: string }).text);
      return indentarRegistro(texto, bid);
    })
    .join("\n\n");

  const linhasElementLinks = [...dados.elementLinks.entries()]
    .map(([id, link]) => `${id}: ${link}`)
    .join("\n");
  const linhasEmbedded = [...dados.embeddedFiles.entries()]
    .map(([fid, link]) => `${fid}: ${link}`)
    .join("\n");

  const bloco = [
    CABECALHO,
    "",
    "## Text Elements",
    registrosTexto,
    "",
    "## Element Links",
    linhasElementLinks,
    "",
    "## Embedded Files",
    linhasEmbedded,
    "",
    "## Scene",
    corpoCena,
  ].join("\n");

  // `verso` já vem do parse com "\n" final quando não-vazio; emitido como está.
  return `${emitirFrontmatter(dados.frontmatter)}${dados.verso}%%\n${bloco}\n%%\n`;
}

// --- parse -------------------------------------------------------------------------------

function extrairSecoes(bloco: string): Map<string, string> {
  const secoes = new Map<string, string>();
  const linhas = bloco.split("\n");
  let atual: string | null = null;
  let buffer: string[] = [];
  const fechar = () => {
    if (atual !== null) secoes.set(atual, buffer.join("\n").replace(/^\n+|\n+$/g, ""));
  };
  for (const linha of linhas) {
    const m = /^## (.+)$/.exec(linha);
    if (m) {
      fechar();
      atual = m[1];
      buffer = [];
    } else if (atual !== null) {
      buffer.push(linha);
    }
  }
  fechar();
  return secoes;
}

function parsearTextElements(secao: string): Map<string, string> {
  const mapa = new Map<string, string>();
  if (!secao.trim()) return mapa;
  // Registros separados por linha completamente vazia. Linhas em branco DENTRO de um
  // texto multilinha vêm como "  " (dois espaços), então não quebram o registro.
  for (const bruto of secao.split(/\n\n+/)) {
    const registro = bruto.replace(/^\n+|\n+$/g, "");
    if (!registro) continue;
    const linhas = registro.split("\n").map((l) => (l.startsWith("  ") ? l.slice(2) : l));
    const ultima = linhas[linhas.length - 1];
    const m = / \^([A-Za-z0-9-]+)$/.exec(ultima);
    if (!m) continue;
    linhas[linhas.length - 1] = ultima.slice(0, ultima.length - m[0].length);
    mapa.set(m[1], desescaparTexto(linhas.join("\n")));
  }
  return mapa;
}

function parsearParesLink(secao: string): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const linha of secao.split("\n")) {
    const m = /^([^:]+):\s*(.+)$/.exec(linha.trim());
    if (m) mapa.set(m[1].trim(), m[2].trim());
  }
  return mapa;
}

function parsearCena(secao: string): CenaDesenho {
  const m = /^(`{3,})(draw-json(?:-lz)?)\n([\s\S]*?)\n\1\s*$/.exec(secao.trim());
  if (!m) return { elements: [], appState: {} };
  const lingua = m[2];
  const bruto =
    lingua === "draw-json-lz"
      ? (decompressFromBase64(m[3].replace(/\n/g, "")) ?? "")
      : m[3];
  let obj: { elements?: unknown[]; appState?: unknown };
  try {
    obj = JSON.parse(bruto || "{}");
  } catch {
    return { elements: [], appState: {} };
  }
  const elements = ((obj.elements as ExcalidrawElement[] | undefined) ?? []).map((el) => ({
    version: 1,
    versionNonce: 0,
    updated: 0,
    ...(el as object),
  })) as ExcalidrawElement[];
  return { elements, appState: (obj.appState as Partial<AppState>) ?? {} };
}

export function ehDesenho(md: string): boolean {
  try {
    return matter(md).data[CHAVE_FRONTMATTER_DESENHO] === "drawing";
  } catch {
    return false;
  }
}

export function parseDesenho(md: string): DadosDesenho {
  const fm = matter(md);
  const frontmatter = fm.data as Record<string, unknown>;
  const resto = fm.content;

  const linhas = resto.split("\n");
  const iAbre = linhas.findIndex((l) => l === "%%");
  let iFecha = -1;
  for (let i = linhas.length - 1; i > iAbre; i -= 1) {
    if (linhas[i] === "%%") {
      iFecha = i;
      break;
    }
  }

  if (iAbre === -1 || iFecha === -1) {
    return {
      frontmatter,
      verso: resto,
      textElements: new Map(),
      elementLinks: new Map(),
      embeddedFiles: new Map(),
      cena: { elements: [], appState: {} },
    };
  }

  const versoBruto = linhas.slice(0, iAbre).join("\n");
  const verso = versoBruto === "" ? "" : `${versoBruto}\n`;
  const bloco = linhas.slice(iAbre + 1, iFecha).join("\n");
  const secoes = extrairSecoes(bloco);

  return {
    frontmatter,
    verso,
    textElements: parsearTextElements(secoes.get("Text Elements") ?? ""),
    elementLinks: parsearParesLink(secoes.get("Element Links") ?? ""),
    embeddedFiles: parsearParesLink(secoes.get("Embedded Files") ?? ""),
    cena: parsearCena(secoes.get("Scene") ?? ""),
  };
}
