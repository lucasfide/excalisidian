// src/sync/formato.ts
// Formato de lote e retrato (doc 17 §4.1, §4.2, §4.4). Serialização pura: JSON com o
// conteúdo em base64, comprimido com gzip (`CompressionStream`/`DecompressionStream`,
// nativos no WebView2 e no node dos testes). Não cifra — isso é `pacote.ts`.

/** Tamanho acima do qual um único arquivo não entra na sincronização (doc 17 §4.4). Usado
 * como limite conservador (não comprimido) para o tamanho de um lote ou parte de retrato. */
export const TAMANHO_MAXIMO_SINCRONIZAVEL = 7 * 1024 * 1024;

export interface Lote {
  versao: 1;
  /** Nome legível do computador que enviou, só para a tela de conflito. */
  dispositivo: string;
  /** ISO 8601. */
  criadoEm: string;
  mudancas: Mudanca[];
}

export type Mudanca =
  | { tipo: "gravar"; caminho: string; base: string | null; hash: string; conteudo: Uint8Array }
  | { tipo: "apagar"; caminho: string; base: string };

export interface Retrato {
  versao: 1;
  /** Último lote incorporado. */
  ateSequencia: number;
  arquivos: { caminho: string; hash: string; conteudo: Uint8Array }[];
}

/** Erro de forma inválida ao ler um lote ou retrato. A mensagem descreve QUAL checagem
 * falhou, nunca o valor que falhou — pode ter vindo de um pacote adulterado. */
export class FormatoInvalido extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "FormatoInvalido";
  }
}

const REGEX_HASH_HEX = /^[0-9a-f]{64}$/;

// --- base64 em blocos, para não estourar a pilha com Uint8Array grande (imagens, PDFs) ---

const TAMANHO_BLOCO_BASE64 = 8192;

function paraBase64(bytes: Uint8Array): string {
  const partes: string[] = [];
  for (let i = 0; i < bytes.length; i += TAMANHO_BLOCO_BASE64) {
    const bloco = bytes.subarray(i, i + TAMANHO_BLOCO_BASE64);
    let binario = "";
    for (let j = 0; j < bloco.length; j++) {
      binario += String.fromCharCode(bloco[j]);
    }
    partes.push(binario);
  }
  return btoa(partes.join(""));
}

function deBase64(base64: string): Uint8Array {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) {
    bytes[i] = binario.charCodeAt(i);
  }
  return bytes;
}

// --- gzip via CompressionStream/DecompressionStream ---

async function comprimir(bytes: Uint8Array): Promise<Uint8Array> {
  const fluxo = new CompressionStream("gzip");
  const escritor = fluxo.writable.getWriter();
  escritor.write(bytes);
  escritor.close();
  return new Uint8Array(await new Response(fluxo.readable).arrayBuffer());
}

async function descomprimir(bytes: Uint8Array): Promise<Uint8Array> {
  const fluxo = new DecompressionStream("gzip");
  const escritor = fluxo.writable.getWriter();
  escritor.write(bytes);
  escritor.close();
  return new Uint8Array(await new Response(fluxo.readable).arrayBuffer());
}

/** SHA-256 do conteúdo, em hex minúsculo. */
export async function hashDe(bytes: Uint8Array): Promise<string> {
  const buffer = await crypto.subtle.digest("SHA-256", bytes);
  const digest = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < digest.length; i++) {
    hex += digest[i].toString(16).padStart(2, "0");
  }
  return hex;
}

// --- caminho: sempre "/", NFC, nunca "\" (regra do projeto) ---

function validarCaminho(valor: unknown): asserts valor is string {
  if (typeof valor !== "string" || valor.length === 0) throw new FormatoInvalido("caminho ausente ou inválido");
  if (valor.includes("\\")) throw new FormatoInvalido("caminho com barra invertida");
  if (valor.normalize("NFC") !== valor) throw new FormatoInvalido("caminho fora de NFC");
}

function validarHash(valor: unknown): asserts valor is string {
  if (typeof valor !== "string" || !REGEX_HASH_HEX.test(valor)) throw new FormatoInvalido("hash malformado");
}

function validarBaseOpcional(valor: unknown): asserts valor is string | null {
  if (valor === null) return;
  validarHash(valor);
}

// --- lote ---

interface MudancaGravarSerializavel {
  tipo: "gravar";
  caminho: string;
  base: string | null;
  hash: string;
  conteudo: string; // base64
}
interface MudancaApagarSerializavel {
  tipo: "apagar";
  caminho: string;
  base: string;
}
type MudancaSerializavel = MudancaGravarSerializavel | MudancaApagarSerializavel;

interface LoteSerializavel {
  versao: 1;
  dispositivo: string;
  criadoEm: string;
  mudancas: MudancaSerializavel[];
}

function paraSerializavel(mudanca: Mudanca): MudancaSerializavel {
  if (mudanca.tipo === "gravar") {
    return {
      tipo: "gravar",
      caminho: mudanca.caminho,
      base: mudanca.base,
      hash: mudanca.hash,
      conteudo: paraBase64(mudanca.conteudo),
    };
  }
  return { tipo: "apagar", caminho: mudanca.caminho, base: mudanca.base };
}

/** JSON com `conteudo` em base64, comprimido com gzip (doc 17 §4.1). Não cifra. */
export async function serializarLote(lote: Lote): Promise<Uint8Array> {
  const serializavel: LoteSerializavel = {
    versao: lote.versao,
    dispositivo: lote.dispositivo,
    criadoEm: lote.criadoEm,
    mudancas: lote.mudancas.map(paraSerializavel),
  };
  return comprimir(new TextEncoder().encode(JSON.stringify(serializavel)));
}

function validarMudanca(bruto: unknown): Mudanca {
  if (typeof bruto !== "object" || bruto === null) throw new FormatoInvalido("mudança: forma inválida");
  const obj = bruto as Record<string, unknown>;

  if (obj.tipo === "gravar") {
    validarCaminho(obj.caminho);
    validarBaseOpcional(obj.base);
    validarHash(obj.hash);
    if (typeof obj.conteudo !== "string") throw new FormatoInvalido("mudança: conteúdo inválido");
    return {
      tipo: "gravar",
      caminho: obj.caminho,
      base: obj.base,
      hash: obj.hash,
      conteudo: deBase64(obj.conteudo),
    };
  }

  if (obj.tipo === "apagar") {
    validarCaminho(obj.caminho);
    validarHash(obj.base);
    return { tipo: "apagar", caminho: obj.caminho, base: obj.base as string };
  }

  throw new FormatoInvalido("mudança: tipo desconhecido");
}

function validarLote(bruto: unknown): Lote {
  if (typeof bruto !== "object" || bruto === null) throw new FormatoInvalido("lote: forma inválida");
  const obj = bruto as Record<string, unknown>;

  if (obj.versao !== 1) throw new FormatoInvalido("lote: versão não suportada");
  if (typeof obj.dispositivo !== "string") throw new FormatoInvalido("lote: dispositivo inválido");
  if (typeof obj.criadoEm !== "string") throw new FormatoInvalido("lote: criadoEm inválido");
  if (!Array.isArray(obj.mudancas)) throw new FormatoInvalido("lote: mudanças inválidas");

  return {
    versao: 1,
    dispositivo: obj.dispositivo,
    criadoEm: obj.criadoEm,
    mudancas: obj.mudancas.map(validarMudanca),
  };
}

/** Lê e valida um lote. Lança `FormatoInvalido` (sem detalhe do conteúdo) se a forma não
 * bater: versão errada, hash malformado, caminho com "\", JSON quebrado, gzip quebrado. */
export async function lerLote(bytes: Uint8Array): Promise<Lote> {
  let json: string;
  try {
    json = new TextDecoder().decode(await descomprimir(bytes));
  } catch {
    throw new FormatoInvalido("lote: não foi possível descomprimir");
  }

  let bruto: unknown;
  try {
    bruto = JSON.parse(json);
  } catch {
    throw new FormatoInvalido("lote: JSON inválido");
  }

  return validarLote(bruto);
}

/** Agrupa mudanças em lotes cujo peso não comprimido (conteúdo de `gravar`) não passa de
 * `TAMANHO_MAXIMO_SINCRONIZAVEL`, preservando a ordem. Lança se uma única mudança já for
 * maior que o limite — o chamador filtra esses arquivos antes (doc 17 §4.4). */
export function dividirEmLotes(mudancas: Mudanca[], dispositivo: string, criadoEm: string): Lote[] {
  for (const mudanca of mudancas) {
    if (mudanca.tipo === "gravar" && mudanca.conteudo.byteLength > TAMANHO_MAXIMO_SINCRONIZAVEL) {
      throw new FormatoInvalido("mudança maior que o tamanho máximo sincronizável");
    }
  }

  const lotes: Lote[] = [];
  let atual: Mudanca[] = [];
  let pesoAtual = 0;

  for (const mudanca of mudancas) {
    const peso = mudanca.tipo === "gravar" ? mudanca.conteudo.byteLength : 0;
    if (atual.length > 0 && pesoAtual + peso > TAMANHO_MAXIMO_SINCRONIZAVEL) {
      lotes.push({ versao: 1, dispositivo, criadoEm, mudancas: atual });
      atual = [];
      pesoAtual = 0;
    }
    atual.push(mudanca);
    pesoAtual += peso;
  }

  if (atual.length > 0) {
    lotes.push({ versao: 1, dispositivo, criadoEm, mudancas: atual });
  }

  return lotes;
}

// --- retrato ---

interface ArquivoRetratoSerializavel {
  caminho: string;
  hash: string;
  conteudo: string; // base64
}

interface RetratoSerializavel {
  versao: 1;
  ateSequencia: number;
  arquivos: ArquivoRetratoSerializavel[];
}

/** JSON com `conteudo` em base64, comprimido com gzip (doc 17 §4.2). Não cifra. */
export async function serializarRetrato(retrato: Retrato): Promise<Uint8Array> {
  const serializavel: RetratoSerializavel = {
    versao: retrato.versao,
    ateSequencia: retrato.ateSequencia,
    arquivos: retrato.arquivos.map((arquivo) => ({
      caminho: arquivo.caminho,
      hash: arquivo.hash,
      conteudo: paraBase64(arquivo.conteudo),
    })),
  };
  return comprimir(new TextEncoder().encode(JSON.stringify(serializavel)));
}

function validarArquivoRetrato(bruto: unknown): Retrato["arquivos"][number] {
  if (typeof bruto !== "object" || bruto === null) throw new FormatoInvalido("arquivo do retrato: forma inválida");
  const obj = bruto as Record<string, unknown>;

  validarCaminho(obj.caminho);
  validarHash(obj.hash);
  if (typeof obj.conteudo !== "string") throw new FormatoInvalido("arquivo do retrato: conteúdo inválido");

  return { caminho: obj.caminho, hash: obj.hash, conteudo: deBase64(obj.conteudo) };
}

function validarRetrato(bruto: unknown): Retrato {
  if (typeof bruto !== "object" || bruto === null) throw new FormatoInvalido("retrato: forma inválida");
  const obj = bruto as Record<string, unknown>;

  if (obj.versao !== 1) throw new FormatoInvalido("retrato: versão não suportada");
  if (typeof obj.ateSequencia !== "number") throw new FormatoInvalido("retrato: ateSequencia inválido");
  if (!Array.isArray(obj.arquivos)) throw new FormatoInvalido("retrato: arquivos inválidos");

  return {
    versao: 1,
    ateSequencia: obj.ateSequencia,
    arquivos: obj.arquivos.map(validarArquivoRetrato),
  };
}

/** Lê e valida um retrato. Mesma política de erro de `lerLote`. */
export async function lerRetrato(bytes: Uint8Array): Promise<Retrato> {
  let json: string;
  try {
    json = new TextDecoder().decode(await descomprimir(bytes));
  } catch {
    throw new FormatoInvalido("retrato: não foi possível descomprimir");
  }

  let bruto: unknown;
  try {
    bruto = JSON.parse(json);
  } catch {
    throw new FormatoInvalido("retrato: JSON inválido");
  }

  return validarRetrato(bruto);
}

/** Divide um retrato em partes de até `TAMANHO_MAXIMO_SINCRONIZAVEL` não comprimidos, todas
 * com o mesmo `ateSequencia` — cada parte é lacrada à parte, com o índice no AAD. */
export function dividirRetrato(retrato: Retrato): Retrato[] {
  for (const arquivo of retrato.arquivos) {
    if (arquivo.conteudo.byteLength > TAMANHO_MAXIMO_SINCRONIZAVEL) {
      throw new FormatoInvalido("arquivo do retrato maior que o tamanho máximo sincronizável");
    }
  }

  const partes: Retrato[] = [];
  let atual: Retrato["arquivos"] = [];
  let pesoAtual = 0;

  for (const arquivo of retrato.arquivos) {
    const peso = arquivo.conteudo.byteLength;
    if (atual.length > 0 && pesoAtual + peso > TAMANHO_MAXIMO_SINCRONIZAVEL) {
      partes.push({ versao: 1, ateSequencia: retrato.ateSequencia, arquivos: atual });
      atual = [];
      pesoAtual = 0;
    }
    atual.push(arquivo);
    pesoAtual += peso;
  }

  if (atual.length > 0 || partes.length === 0) {
    partes.push({ versao: 1, ateSequencia: retrato.ateSequencia, arquivos: atual });
  }

  return partes;
}
