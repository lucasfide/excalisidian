// src/sync/pacote.ts
//
// A peça mais baixa da sincronização (doc 17 §2, §4.3): transforma bytes em pacotes opacos
// que o servidor guarda sem entender. Cada pacote é `nonce ‖ AES-GCM(chave, preenchido, aad)`.
// O preenchimento em escada esconde o tamanho exato do conteúdo (o servidor só vê o degrau);
// o AAD amarra o pacote ao vault, ao tipo e à posição dele, para que copiar um pacote para
// outro lugar não abra. Módulo puro: sem disco, sem rede, só WebCrypto.

/** Degraus da escada de preenchimento: 16 KiB, 32 KiB, … até 8 MiB. */
export const ESCADA: readonly number[] = (() => {
  const degraus: number[] = [];
  for (let tamanho = 16 * 1024; tamanho <= 8 * 1024 * 1024; tamanho *= 2) {
    degraus.push(tamanho);
  }
  return degraus;
})();

const MAIOR_DEGRAU = ESCADA[ESCADA.length - 1];

/** Marcador de fim do conteúdo real dentro do preenchimento. */
const MARCADOR_FIM = 0x80;

/**
 * `bytes ‖ 0x80 ‖ 0x00…` até o menor degrau da escada que caiba o conteúdo mais o marcador.
 * Lança se nem o maior degrau (8 MiB) couber.
 */
export function preencher(bytes: Uint8Array): Uint8Array {
  // Precisa de espaço para os bytes originais MAIS o marcador 0x80 — por isso um conteúdo
  // do tamanho exato de um degrau sobe para o próximo (não haveria lugar para o marcador).
  const tamanhoNecessario = bytes.byteLength + 1;
  const degrau = ESCADA.find((tamanho) => tamanho >= tamanhoNecessario);
  if (degrau === undefined) {
    throw new Error(
      `conteúdo grande demais para o preenchimento: ${bytes.byteLength} bytes não cabem no maior degrau (${MAIOR_DEGRAU})`,
    );
  }
  const preenchido = new Uint8Array(degrau);
  preenchido.set(bytes, 0);
  preenchido[bytes.byteLength] = MARCADOR_FIM;
  // O resto já nasce zerado (Uint8Array).
  return preenchido;
}

/**
 * Inverso de `preencher`: remove do último `0x80` em diante. Lança se o formato estiver
 * errado (sem marcador, ou lixo não-zero depois dele).
 */
export function despreencher(bytes: Uint8Array): Uint8Array {
  let indiceMarcador = -1;
  for (let i = bytes.byteLength - 1; i >= 0; i--) {
    if (bytes[i] === MARCADOR_FIM) {
      indiceMarcador = i;
      break;
    }
    if (bytes[i] !== 0x00) {
      // Lixo não-zero antes de achar o marcador: formato inválido.
      throw new Error("preenchimento inválido: sem marcador de fim");
    }
  }
  if (indiceMarcador === -1) {
    throw new Error("preenchimento inválido: sem marcador de fim");
  }
  return bytes.slice(0, indiceMarcador);
}

/** 32 bytes aleatórios: a `chaveDoVault` (doc 17 §2), uma por vault sincronizado. */
export async function gerarChaveDoVault(): Promise<Uint8Array> {
  return globalThis.crypto.getRandomValues(new Uint8Array(32));
}

async function importarChave(chave: Uint8Array): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey("raw", chave, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

/**
 * Erro próprio para qualquer falha ao abrir um pacote: chave errada, AAD errado, pacote
 * corrompido, formato de preenchimento inválido. Nunca carrega o conteúdo nem detalhe
 * interno que ajudasse um atacante a distinguir o motivo da falha.
 */
export class PacoteInvalido extends Error {
  constructor() {
    super("pacote inválido");
    this.name = "PacoteInvalido";
  }
}

/**
 * Preenche, cifra com AES-256-GCM e nonce aleatório de 12 bytes. Devolve
 * `nonce ‖ cifrado`, onde `cifrado` já inclui a tag de 16 bytes (contrato do WebCrypto).
 * Tamanho final = degrau do preenchimento + 12 (nonce) + 16 (tag).
 */
export async function lacrar(
  chave: Uint8Array,
  dados: Uint8Array,
  aad: Uint8Array,
): Promise<Uint8Array> {
  const preenchido = preencher(dados);
  const chaveImportada = await importarChave(chave);
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const cifrado = await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, additionalData: aad },
    chaveImportada,
    preenchido,
  );
  const pacote = new Uint8Array(nonce.byteLength + cifrado.byteLength);
  pacote.set(nonce, 0);
  pacote.set(new Uint8Array(cifrado), nonce.byteLength);
  return pacote;
}

/**
 * Inverso de `lacrar`. Qualquer falha (chave errada, AAD errado, pacote corrompido,
 * preenchimento inválido) vira `PacoteInvalido` — sem conteúdo, sem detalhe interno.
 */
export async function abrir(
  chave: Uint8Array,
  pacote: Uint8Array,
  aad: Uint8Array,
): Promise<Uint8Array> {
  try {
    const nonce = pacote.slice(0, 12);
    const cifrado = pacote.slice(12);
    const chaveImportada = await importarChave(chave);
    const decifrado = await globalThis.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce, additionalData: aad },
      chaveImportada,
      cifrado,
    );
    return despreencher(new Uint8Array(decifrado));
  } catch {
    throw new PacoteInvalido();
  }
}

/** Tipo de pacote, usado no AAD para amarrar cada um ao seu lugar (doc 17 §2). */
export type TipoPacote = "lote" | "retrato" | "nome" | "envelope";

/**
 * Prefixo literal do AAD. É uma string CONGELADA, e não o `APP_ID` — se o nome do produto
 * mudar (ADR-9), o AAD não pode mudar, senão nenhum pacote existente abre mais (mesmo
 * motivo do `PREFIXO_SAL` em `src/conta/derivacaoSenha.ts`).
 */
const PREFIXO_AAD = "excalisidian-sync-v1";

/**
 * Bytes estáveis de AAD para um pacote: `excalisidian-sync-v1|<idDoVault>|<tipo>|<indice>`.
 * Um pacote copiado para outro vault, outro tipo ou outro índice não abre.
 */
export function aadDe(idDoVault: string, tipo: TipoPacote, indice?: number): Uint8Array {
  const partes = [PREFIXO_AAD, idDoVault, tipo];
  if (indice !== undefined) {
    partes.push(String(indice));
  }
  return new TextEncoder().encode(partes.join("|"));
}

/**
 * Envelopa a `chaveDoVault` com a `chaveDeEnvelope` (doc 17 §2): `lacrar` com AAD de tipo
 * `envelope`. Não precisa da escada de preenchimento (a chave já tem tamanho fixo), mas usar
 * `lacrar` simplifica e o custo é desprezível — aceitável.
 */
export async function envelopar(
  chaveDeEnvelope: Uint8Array,
  chaveDoVault: Uint8Array,
  idDoVault: string,
): Promise<Uint8Array> {
  return lacrar(chaveDeEnvelope, chaveDoVault, aadDe(idDoVault, "envelope"));
}

/** Inverso de `envelopar`. */
export async function abrirEnvelope(
  chaveDeEnvelope: Uint8Array,
  envelope: Uint8Array,
  idDoVault: string,
): Promise<Uint8Array> {
  return abrir(chaveDeEnvelope, envelope, aadDe(idDoVault, "envelope"));
}
