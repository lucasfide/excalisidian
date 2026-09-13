// Busca por conteúdo (RF4.8, doc 04 §8): índice MiniSearch persistido, com atualização
// incremental por documento (doc 05 §8). Textos de desenhos são pesquisáveis: o conteúdo do
// .draw.md é extraído com parseDesenho (verso + Text Elements + Element Links), nunca do
// JSON bruto da cena.
//
// O índice vive em estado de módulo (um por vault, recarregado na troca) e é persistido em
// %APPDATA% via plugin-store, no mesmo padrão do cache de metadados (doc 02 §1:
// cache/<hash>/search.json — aqui, `busca-<hash>.json` ao lado de `cache-<hash>.json`).
// Como todo cache, é descartável: se corromper, é reconstruído do zero.

import MiniSearch from "minisearch";
import type { SearchResult } from "minisearch";
import { load } from "@tauri-apps/plugin-store";

import { hashVault } from "../indice/cache";
import { lerFrontmatter } from "../indice/frontmatter";
import { parseDesenho } from "../canvas/formatoDesenho";
import { tipoDoArquivo } from "../vault/arvore";

const VERSAO_INDICE = 1;
/** Quantos candidatos o MiniSearch devolve antes do filtro de frase/exclusão e dos trechos. */
const LIMITE_CANDIDATOS = 40;
/** Máximo de arquivos no resultado. */
const LIMITE_ARQUIVOS = 20;
/** Doc 04 §8: no máximo 3 trechos por arquivo. */
const TRECHOS_POR_ARQUIVO = 3;
const DEBOUNCE_SALVAR_MS = 2000;

export type KindBusca = "note" | "drawing";

interface DocBusca {
  id: string; // path
  path: string;
  titulo: string;
  kind: KindBusca;
  corpo: string;
}

type ResultadoBruto = SearchResult & {
  path: string;
  titulo: string;
  kind: KindBusca;
};

interface Persistido {
  version: number;
  /** `JSON.stringify(mini.toJSON())` — o loadJSON do minisearch 7 recebe a string. */
  mini: string;
  docs: [string, { mtimeMs: number; size: number }][];
}

function opcoesMini() {
  return {
    fields: ["titulo", "corpo"],
    storeFields: ["path", "titulo", "kind"],
    searchOptions: { boost: { titulo: 2 } },
  };
}

let mini: MiniSearch<DocBusca> | null = null;
let raizAtual = "";
let docs = new Map<string, { mtimeMs: number; size: number }>();
let timerSalvar: number | undefined;
let sincronizando: Promise<void> | null = null;

function nomeArquivo(raiz: string): string {
  return `busca-${hashVault(raiz)}.json`;
}

/** Nome de exibição: basename sem `.md`/`.draw.md`. */
export function tituloDe(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  return base.replace(/\.draw\.md$/i, "").replace(/\.md$/i, "");
}

/** Texto pesquisável de um arquivo. Nota: markdown sem o frontmatter. Desenho: verso +
 * textos de elementos + alvos de links — o JSON da cena fica de fora. */
export function textoParaBusca(path: string, conteudo: string): string {
  if (tipoDoArquivo(path) === "drawing") {
    try {
      const d = parseDesenho(conteudo);
      return [d.verso, ...d.textElements.values(), ...d.elementLinks.values()]
        .filter((t) => t.length > 0)
        .join("\n");
    } catch {
      return "";
    }
  }
  return lerFrontmatter(conteudo).conteudo;
}

/** Carrega o índice persistido do vault (ou começa vazio). Chamado na abertura/troca. */
export async function inicializarBusca(raiz: string): Promise<void> {
  raizAtual = raiz;
  docs = new Map();
  mini = new MiniSearch<DocBusca>(opcoesMini());
  try {
    const store = await load(nomeArquivo(raiz), { autoSave: false });
    const dados = await store.get<Persistido>("indice");
    if (dados && dados.version === VERSAO_INDICE && dados.mini) {
      mini = MiniSearch.loadJSON<DocBusca>(dados.mini, opcoesMini());
      docs = new Map(dados.docs ?? []);
    }
  } catch {
    // sem índice persistido (primeira execução) ou corrompido: recomeça vazio
  }
}

export function atualizarDocumentoBusca(
  path: string,
  conteudo: string,
  mtimeMs: number,
  size: number,
): void {
  if (!mini) return;
  const kind = tipoDoArquivo(path);
  if (kind === "attachment") {
    removerDocumentoBusca(path);
    return;
  }
  // `discard` lança se o id não está no índice; `docs` espelha o que foi indexado.
  if (docs.has(path)) mini.discard(path);
  mini.add({
    id: path,
    path,
    titulo: tituloDe(path),
    kind: kind as KindBusca,
    corpo: textoParaBusca(path, conteudo),
  });
  docs.set(path, { mtimeMs, size });
  agendarSalvarBusca();
}

export function removerDocumentoBusca(path: string): void {
  if (!mini) return;
  if (docs.has(path)) mini.discard(path);
  docs.delete(path);
  agendarSalvarBusca();
}

/** Passada completa: indexa o que mudou (por mtimeMs+size, mesmo contrato do cache de
 * metadados) e remove o que sumiu. Chamado pelo vaultStore.reindexar. */
export async function sincronizarBusca(
  entradas: { path: string; isDir: boolean; mtimeMs: number; size: number }[],
  lerTexto: (path: string) => Promise<string>,
): Promise<void> {
  if (!mini) return;
  if (sincronizando) return sincronizando;
  sincronizando = (async () => {
    try {
      const vivos = new Set<string>();
      for (const e of entradas) {
        if (e.isDir || tipoDoArquivo(e.path) === "attachment") continue;
        vivos.add(e.path);
        const anterior = docs.get(e.path);
        if (anterior && anterior.mtimeMs === e.mtimeMs && anterior.size === e.size) {
          continue;
        }
        try {
          const texto = await lerTexto(e.path);
          atualizarDocumentoBusca(e.path, texto, e.mtimeMs, e.size);
        } catch {
          // ilegível: fica de fora desta passada
        }
      }
      for (const path of [...docs.keys()]) {
        if (!vivos.has(path)) removerDocumentoBusca(path);
      }
      agendarSalvarBusca();
    } finally {
      sincronizando = null;
    }
  })();
  return sincronizando;
}

export function agendarSalvarBusca(): void {
  if (typeof window === "undefined") {
    void salvarBusca();
    return;
  }
  window.clearTimeout(timerSalvar);
  timerSalvar = window.setTimeout(() => void salvarBusca(), DEBOUNCE_SALVAR_MS);
}

export async function salvarBusca(): Promise<void> {
  if (!mini || !raizAtual) return;
  try {
    const store = await load(nomeArquivo(raizAtual), { autoSave: false });
    const dados: Persistido = {
      version: VERSAO_INDICE,
      mini: JSON.stringify(mini.toJSON()),
      docs: [...docs.entries()],
    };
    await store.set("indice", dados);
    await store.save();
  } catch {
    // cache é descartável (doc 02 §1): falhou, tenta na próxima
  }
}

export function buscaEstaPronta(): boolean {
  return mini !== null;
}

export function contarDocumentosBusca(): number {
  return docs.size;
}

// ——— Consulta (doc 04 §8: termo, "frase exata", -termo para excluir) ———

export interface ConsultaBusca {
  termos: string[];
  frases: string[];
  excluidos: string[];
}

export function parsearConsulta(consulta: string): ConsultaBusca {
  const frases: string[] = [];
  const excluidos: string[] = [];
  const termos: string[] = [];
  const re = /"([^"]*)"|(-\S+)|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(consulta)) !== null) {
    if (m[1] !== undefined) {
      const frase = m[1].trim().toLowerCase();
      if (frase) {
        frases.push(frase);
        termos.push(...frase.split(/\s+/));
      }
    } else if (m[2] !== undefined) {
      const t = m[2].slice(1).toLowerCase();
      if (t) excluidos.push(t);
    } else if (m[3] !== undefined) {
      const t = m[3].toLowerCase();
      if (t && t !== "-") termos.push(t);
    }
  }
  return { termos: [...new Set(termos)], frases, excluidos };
}

export interface TrechoBusca {
  /** Linha 1-based no texto usado para os trechos (a nota inteira, incluindo frontmatter —
   * o número bate com o arquivo; no desenho, o texto extraído). */
  linha: number;
  trecho: string;
}

export interface ResultadoConteudo {
  path: string;
  titulo: string;
  kind: KindBusca;
  trechos: TrechoBusca[];
}

/** Busca e monta os resultados com trechos. `lerTexto` vem do adapter do vault: só os
 * candidatos são lidos, para filtrar frase/exclusão e recortar os trechos. */
export async function buscarConteudo(
  consulta: string,
  lerTexto: (path: string) => Promise<string>,
): Promise<ResultadoConteudo[]> {
  const { termos, frases, excluidos } = parsearConsulta(consulta);
  if (!mini || termos.length === 0) return [];
  const brutos = mini
    .search(termos.join(" "))
    .slice(0, LIMITE_CANDIDATOS) as ResultadoBruto[];

  const resultados: ResultadoConteudo[] = [];
  for (const r of brutos) {
    if (resultados.length >= LIMITE_ARQUIVOS) break;
    let texto: string;
    try {
      texto = await lerTexto(r.path);
    } catch {
      continue; // sumiu do disco desde a indexação
    }
    const corpo = textoParaBusca(r.path, texto);
    const buscavel = corpo.toLowerCase();
    const tituloMin = r.titulo.toLowerCase();
    if (frases.some((f) => !buscavel.includes(f) && !tituloMin.includes(f))) continue;
    if (excluidos.some((t) => buscavel.includes(t) || tituloMin.includes(t))) continue;
    // Trechos saem do texto original nas notas (número de linha bate com o arquivo);
    // no desenho, do texto extraído (o JSON da cena não tem linha que interesse).
    const fonteTrechos = r.kind === "drawing" ? corpo : texto;
    resultados.push({
      path: r.path,
      titulo: r.titulo,
      kind: r.kind,
      trechos: montarTrechos(fonteTrechos, termos, frases),
    });
  }
  return resultados;
}

export function montarTrechos(
  texto: string,
  termos: string[],
  frases: string[],
): TrechoBusca[] {
  const agulhas = [...frases, ...termos].filter((a) => a.length > 0);
  if (agulhas.length === 0) return [];
  const linhas = texto.split("\n");
  const trechos: TrechoBusca[] = [];
  for (let i = 0; i < linhas.length && trechos.length < TRECHOS_POR_ARQUIVO; i++) {
    const linha = linhas[i];
    const min = linha.toLowerCase();
    if (!agulhas.some((a) => min.includes(a))) continue;
    trechos.push({ linha: i + 1, trecho: recortarLinha(linha, agulhas) });
  }
  return trechos;
}

const LARGURA_TRECHO = 140;

function recortarLinha(linha: string, agulhas: string[]): string {
  if (linha.length <= LARGURA_TRECHO) return linha;
  const min = linha.toLowerCase();
  let pos = -1;
  for (const a of agulhas) {
    const p = min.indexOf(a);
    if (p >= 0 && (pos < 0 || p < pos)) pos = p;
  }
  if (pos < 0) return `${linha.slice(0, LARGURA_TRECHO)}…`;
  const inicio = Math.max(0, pos - 40);
  const fim = Math.min(linha.length, inicio + LARGURA_TRECHO);
  return `${inicio > 0 ? "…" : ""}${linha.slice(inicio, fim)}${fim < linha.length ? "…" : ""}`;
}

export interface ParteDestaque {
  texto: string;
  destaque: boolean;
}

/** Divide um trecho em partes marcando as ocorrências dos termos — a UI renderiza as
 * marcadas com o realce de busca (mesma cor do search do editor, `ocre` a 30%). */
export function partesComDestaque(
  trecho: string,
  termos: string[],
  frases: string[],
): ParteDestaque[] {
  const agulhas = [...frases, ...termos]
    .filter((a) => a.length > 0)
    .sort((a, b) => b.length - a.length);
  if (agulhas.length === 0) return [{ texto: trecho, destaque: false }];
  const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(${agulhas.map(escapar).join("|")})`, "gi");
  return trecho
    .split(re)
    .filter((p) => p !== "")
    .map((p) => ({
      texto: p,
      destaque: agulhas.some((a) => p.toLowerCase() === a),
    }));
}
