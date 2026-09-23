// src/conta/derivacaoSenha.ts
//
// A senha da conta também vai proteger o vault (ADR-39), então o servidor nunca pode
// recebê-la — se recebesse, quem invadisse o servidor teria a senha de todo mundo, e ela
// também abriria as notas sincronizadas. Em vez disso, o computador deriva localmente,
// de forma lenta (Argon2id) e cara de repetir por força bruta, uma "chave mestra". Dela
// saem, por HKDF-SHA256, duas chaves com finalidades diferentes:
//   - `provaDeIdentidade`: o que vai para o servidor no lugar da senha. O servidor trata
//     como trataria uma senha (guarda só um hash lento dela), mas nunca vê a senha real.
//   - `chaveDeEnvelope`: nunca sai deste computador; um dia vai proteger a chave do vault
//     na sincronização (ADR-32/33). Hoje ninguém a usa — ela é exportada só para fixar o
//     contrato e ter teste.
//
// As constantes abaixo (parâmetros do Argon2id, etiqueta do kdf, prefixo do sal, e as duas
// `info` do HKDF) são CONTRATO com um servidor futuro. Mudar qualquer uma delas troca a
// prova de identidade de todas as contas existentes e quebra o login — não "melhore" sem
// uma tarefa dedicada que trate a migração.
import { argon2id } from "hash-wasm";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";

/** Parâmetros do Argon2id: os padrões do Bitwarden (64 MiB, 3 iterações, 4 lanes). */
const PARAMETROS_ARGON2ID = {
  m: 65536, // KiB (64 MiB)
  t: 3,
  p: 4,
  dkLen: 32,
} as const;

/**
 * Etiqueta enviada ao servidor junto com a prova, para que um dia os parâmetros do
 * Argon2id possam subir sem quebrar quem já tem conta.
 */
export const ETIQUETA_KDF = "argon2id-m65536-t3-p4-v1";

/**
 * Prefixo literal do sal. É uma string CONGELADA, e não o `APP_ID` — se o nome do produto
 * mudar (ADR-9), o sal não pode mudar, senão ninguém mais consegue entrar.
 */
export const PREFIXO_SAL = "excalisidian-sal-da-conta-v1:";

/** `info` do HKDF para a chave que vai para o servidor. */
export const INFO_PROVA = "excalisidian/prova-de-identidade/v1";

/** `info` do HKDF para a chave que nunca sai do computador. */
export const INFO_ENVELOPE = "excalisidian/envelope-do-vault/v1";

/** E-mail com `trim()`, minúsculas e NFC — para o sal e para o contrato com o servidor. */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase().normalize("NFC");
}

/**
 * Deriva, localmente, a prova de identidade (vai para o servidor) e a chave de envelope
 * (nunca sai do computador) a partir do e-mail e da senha da conta.
 *
 * A senha só recebe `normalize("NFC")` — sem `trim()`, porque espaços digitados na senha
 * fazem parte dela. O Argon2id (`hash-wasm`) já é assíncrono e não trava a tela.
 */
export async function derivarDaSenha(
  email: string,
  senha: string,
): Promise<{ provaDeIdentidade: string; chaveDeEnvelope: Uint8Array; kdf: string }> {
  const emailNormalizado = normalizarEmail(email);
  const senhaNormalizada = senha.normalize("NFC");

  const sal = sha256(utf8ToBytes(PREFIXO_SAL + emailNormalizado));

  // Argon2id roda pelo `hash-wasm` (a implementação de referência em C compilada para
  // WASM), não pelo `@noble/hashes`: medido nesta máquina, o `argon2idAsync` do noble
  // levou ~3,8 s com estes parâmetros, e o `argon2id` do hash-wasm leva ~0,3 s — o
  // `tauri.conf.json` já libera WASM no WebView (`csp: null`), então não há custo extra
  // de superfície. O `@noble/hashes` continua para HKDF e SHA-256, e é a implementação
  // usada no teste do vetor da RFC 9106 (o hash-wasm não aceita "associated data").
  // A chave mestra fica só nesta função — quem chama `derivarDaSenha` nunca a recebe.
  const chaveMestra = await argon2id({
    password: utf8ToBytes(senhaNormalizada),
    salt: sal,
    iterations: PARAMETROS_ARGON2ID.t,
    parallelism: PARAMETROS_ARGON2ID.p,
    memorySize: PARAMETROS_ARGON2ID.m,
    hashLength: PARAMETROS_ARGON2ID.dkLen,
    outputType: "binary",
  });

  const provaBytes = hkdf(sha256, chaveMestra, undefined, utf8ToBytes(INFO_PROVA), 32);
  const chaveDeEnvelope = hkdf(sha256, chaveMestra, undefined, utf8ToBytes(INFO_ENVELOPE), 32);

  // Base64 padrão (com "="), via `btoa` sobre os bytes brutos — @noble/hashes não expõe
  // utilitário de base64.
  let binario = "";
  for (const byte of provaBytes) binario += String.fromCharCode(byte);
  const provaDeIdentidade = btoa(binario);

  return { provaDeIdentidade, chaveDeEnvelope, kdf: ETIQUETA_KDF };
}
