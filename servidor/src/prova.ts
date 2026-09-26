// servidor/src/prova.ts
// Verificação da prova de identidade (nunca a senha — ADR-39, doc 18 §2) com scrypt do
// `node:crypto`. Parâmetros explícitos, mais fortes que o mínimo recomendado, porque a
// prova já passou por Argon2id no cliente (src/conta/derivacaoSenha.ts) — aqui o objetivo é
// só impedir que um vazamento do banco sirva para entrar direto, sem dependência extra.

import crypto from "node:crypto";

export const SCRYPT_N = 2 ** 15;
export const SCRYPT_R = 8;
export const SCRYPT_P = 1;
export const SCRYPT_TAMANHO = 32;

// `128 * N * r * p` bytes é a memória que o scrypt com estes parâmetros exige
// (128 * 32768 * 8 * 1 = 32 MiB) — exatamente o padrão do Node (`maxmem: 32 * 1024 * 1024`).
// Ficar bem acima da exigência evita um "Invalid maxmem" por arredondamento entre versões
// do Node, em troca de memória que esta VPS de uso pessoal tem de sobra.
export const SCRYPT_MAXMEM = 64 * 1024 * 1024;

/**
 * Sal fixo, só para gastar (aproximadamente) o mesmo tempo do scrypt real quando o e-mail
 * não existe — doc 18 §3 exige o MESMO 401 para e-mail inexistente e prova errada, para não
 * revelar por tempo de resposta quem tem conta. Nunca usado para uma conta de verdade.
 */
const SAL_FALSO = Buffer.from("excalisidian-sal-falso-para-timing-v1", "utf8").subarray(0, 16);
const HASH_FALSO_REFERENCIA = Buffer.alloc(SCRYPT_TAMANHO, 0);

export function gerarSal(): Buffer {
  return crypto.randomBytes(16);
}

export function derivarHashDaProva(provaBytes: Uint8Array, sal: Uint8Array): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      provaBytes,
      sal,
      SCRYPT_TAMANHO,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM },
      (erro, chave) => {
        if (erro) reject(erro);
        else resolve(chave);
      },
    );
  });
}

/** Compara, em tempo constante, a prova recebida com o hash guardado na conta. */
export async function provaConfere(
  provaBytes: Uint8Array,
  sal: Uint8Array,
  hashGuardado: Uint8Array,
): Promise<boolean> {
  const calculado = await derivarHashDaProva(provaBytes, sal);
  const guardado = Buffer.from(hashGuardado);
  if (calculado.length !== guardado.length) return false;
  return crypto.timingSafeEqual(calculado, guardado);
}

/**
 * Chamada no lugar de `provaConfere` quando o e-mail não existe: roda o mesmo scrypt (contra
 * o sal falso) e descarta o resultado, só para consumir tempo parecido antes de responder o
 * mesmo 401 de credenciais.
 */
export async function gastarTempoDeEmailInexistente(provaBytes: Uint8Array): Promise<void> {
  const calculado = await derivarHashDaProva(provaBytes, SAL_FALSO);
  crypto.timingSafeEqual(calculado, HASH_FALSO_REFERENCIA); // resultado descartado de propósito
}
