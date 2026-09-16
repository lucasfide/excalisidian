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
import { dobrar } from "./normalizacao";

// Sobe quando o formato do índice persistido muda de um jeito que exige reconstrução (doc
// 13 §2.1): a v2 troca o `processTerm` padrão do MiniSearch (toLowerCase) por `dobrar`
// (sem acento), então um índice v1 salvo em disco tem termos com acento e não bate mais
// com a consulta dobrada — precisa reindexar do zero.
const VERSAO_INDICE = 2;
/** Tamanho mínimo do termo pra entrar em busca fuzzy — termo curto com erro de digitação
 * vira outra palavra válida com muita facilidade (ex.: "de" -> "se"), fuzzy só compensa a
 * partir de um termo com corpo. */
const TAMANHO_MINIMO_FUZZY = 5;
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
    // `dobrar` no lugar do toLowerCase padrão: indexa e consulta sem acento (doc 13 §2.1,
    // problema 2 — "reuniao" tem que achar "Reunião"). É a mesma função usada em
    // parsearConsulta/buscaTitulos, então título e conteúdo casam pela mesma regra.
    processTerm: dobrar,
    searchOptions: {
      boost: { titulo: 2 },
      // Prefixo: "proj" acha "Projeto" (problema 3). Fuzzy só para termo com corpo
      // (ver TAMANHO_MINIMO_FUZZY) — em termo curto o ruído de falsos positivos supera o
      // ganho de tolerância a erro de digitação.
      prefix: true,
      fuzzy: (termo: string) => (termo.length >= TAMANHO_MINIMO_FUZZY ? 0.2 : false),
    },
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
      const frase = dobrar(m[1].trim());
      if (frase) {
        frases.push(frase);
        termos.push(...frase.split(/\s+/));
      }
    } else if (m[2] !== undefined) {
      const t = dobrar(m[2].slice(1));
      if (t) excluidos.push(t);
    } else if (m[3] !== undefined) {
      const t = dobrar(m[3]);
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
  /** Linha inteira, sem recorte nem "…" — usada pelo `revealText` do editor (doc 13 §1.5),
   * que precisa da linha completa pra achar e revelar, não do trecho recortado pra exibição. */
  linhaCompleta: string;
}

export interface ResultadoConteudo {
  path: string;
  titulo: string;
  kind: KindBusca;
  trechos: TrechoBusca[];
}

/** Busca e monta os resultados com trechos. `lerTexto` vem do adapter do vault: só os
 * candidatos são lidos, para filtrar frase/exclusão e recortar os trechos.
 *
 * `combinar` decide se os termos soltos (fora de frase/exclusão) precisam TODOS aparecer
 * ("AND", doc 13 §1.3: "reunião time" só traz nota com as duas palavras) ou se BASTA um
 * ("OR", padrão). O padrão continua "OR" porque `src/agente/recuperacao.ts` chama esta
 * função com uma lista de palavras-chave livres do diff — ali "um dos termos aparece" é o
 * comportamento certo, e mudar o padrão quebraria a recuperação do agente sem ele pedir
 * nada diferente. A UI da busca unificada passa `{ combinar: "AND" }` explicitamente. */
export async function buscarConteudo(
  consulta: string,
  lerTexto: (path: string) => Promise<string>,
  opcoes?: { combinar?: "AND" | "OR" },
): Promise<ResultadoConteudo[]> {
  const { termos, frases, excluidos } = parsearConsulta(consulta);
  if (!mini || termos.length === 0) return [];
  const brutos = mini
    .search(termos.join(" "), { combineWith: opcoes?.combinar ?? "OR" })
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
    const buscavel = dobrar(corpo);
    const tituloMin = dobrar(r.titulo);
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
  // `dobrar` nas agulhas é defensivo (parsearConsulta já entrega tudo dobrado) — mantém
  // a função correta se for chamada direto com termos "crus", como faz o teste dela.
  const agulhas = [...frases, ...termos].map(dobrar).filter((a) => a.length > 0);
  if (agulhas.length === 0) return [];
  const linhas = texto.split("\n");
  const trechos: TrechoBusca[] = [];
  for (let i = 0; i < linhas.length && trechos.length < TRECHOS_POR_ARQUIVO; i++) {
    const linha = linhas[i];
    // `dobrar` preserva o comprimento em UTF-16 (texto NFC): a posição achada aqui é a
    // mesma posição no `linha` original, por isso o recorte abaixo pode indexar `linha`
    // diretamente com a posição encontrada no texto dobrado.
    const dobrada = dobrar(linha);
    if (!agulhas.some((a) => dobrada.includes(a))) continue;
    trechos.push({
      linha: i + 1,
      trecho: recortarLinha(linha, dobrada, agulhas),
      linhaCompleta: linha,
    });
  }
  return trechos;
}

const LARGURA_TRECHO = 140;

function recortarLinha(linha: string, dobrada: string, agulhas: string[]): string {
  if (linha.length <= LARGURA_TRECHO) return linha;
  let pos = -1;
  for (const a of agulhas) {
    const p = dobrada.indexOf(a);
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
 * marcadas com o realce de busca (mesma cor do search do editor, `ocre` a 30%).
 *
 * O destaque sai do texto ORIGINAL (com acento): a busca é feita em `dobrar(trecho)`, que
 * preserva o comprimento em UTF-16 do trecho original (NFC), então a posição de cada
 * ocorrência encontrada no texto dobrado vale também no texto original — dá pra recortar
 * `trecho` direto com esses índices em vez de casar regex contra o texto acentuado.
 *
 * Com prefixo (ex.: consulta "proj"), destaca só o trecho que casou — "Proj" dentro de
 * "Projeto" — e não a palavra inteira. Escolha: destacar a palavra inteira exigiria achar
 * limite de palavra (e decidir o que é "palavra" em nomes com hífen/underscore, que o
 * resto da base não define), enquanto destacar exatamente o que casou é o que as outras
 * funções desta tarefa já fazem (frase exata, termo, exclusão) — consistência com o
 * restante do destaque valeu mais que marcar a palavra toda por um prefixo parcial. */
export function partesComDestaque(
  trecho: string,
  termos: string[],
  frases: string[],
): ParteDestaque[] {
  // `dobrar` é defensivo aqui pelo mesmo motivo de `montarTrechos`: os chamadores reais já
  // mandam tudo dobrado, mas a função fica correta mesmo chamada com termos "crus".
  const agulhas = [...frases, ...termos]
    .map(dobrar)
    .filter((a) => a.length > 0)
    .sort((a, b) => b.length - a.length); // agulha mais longa primeiro cobre a mais curta
  if (agulhas.length === 0) return [{ texto: trecho, destaque: false }];

  const dobrado = dobrar(trecho);
  const ocorrencias: { inicio: number; fim: number }[] = [];
  for (const agulha of agulhas) {
    let pos = 0;
    let i: number;
    while ((i = dobrado.indexOf(agulha, pos)) >= 0) {
      ocorrencias.push({ inicio: i, fim: i + agulha.length });
      pos = i + 1; // avança 1 (não `agulha.length`) pra não perder ocorrências sobrepostas
    }
  }
  if (ocorrencias.length === 0) return [{ texto: trecho, destaque: false }];

  // Mescla ocorrências sobrepostas/adjacentes (ex.: termo e frase que se cruzam) pra não
  // fatiar o mesmo trecho em duas marcações.
  ocorrencias.sort((a, b) => a.inicio - b.inicio || b.fim - a.fim);
  const mescladas: { inicio: number; fim: number }[] = [];
  for (const oc of ocorrencias) {
    const ultima = mescladas[mescladas.length - 1];
    if (ultima && oc.inicio <= ultima.fim) {
      ultima.fim = Math.max(ultima.fim, oc.fim);
    } else {
      mescladas.push({ ...oc });
    }
  }

  const partes: ParteDestaque[] = [];
  let cursor = 0;
  for (const { inicio, fim } of mescladas) {
    if (inicio > cursor) partes.push({ texto: trecho.slice(cursor, inicio), destaque: false });
    partes.push({ texto: trecho.slice(inicio, fim), destaque: true });
    cursor = fim;
  }
  if (cursor < trecho.length) partes.push({ texto: trecho.slice(cursor), destaque: false });
  return partes;
}
