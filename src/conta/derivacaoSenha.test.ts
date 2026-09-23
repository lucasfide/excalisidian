// src/conta/derivacaoSenha.test.ts
//
// Vetor da RFC 9106 §5.3 (Argon2id): copiado literalmente de
// https://www.rfc-editor.org/rfc/rfc9106.html (seção "5.3. Argon2id Test Vectors").
// Password = 32 bytes de 0x01, Salt = 16 bytes de 0x02, Secret (K) = 8 bytes de 0x03,
// Associated data (X) = 12 bytes de 0x04, m = 32 KiB, t = 3, p = 4, versão 0x13 (19),
// tag de 32 bytes = 0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659.
// Este é o único teste que cobre a lacuna da auditoria da Cure53 (não avaliou o Argon2).
import { describe, expect, it, beforeAll } from "vitest";
import { argon2id as argon2idNoble, argon2idAsync as argon2idNobleAsync } from "@noble/hashes/argon2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { argon2id as argon2idHashWasm } from "hash-wasm";

import {
  ETIQUETA_KDF,
  INFO_ENVELOPE,
  INFO_PROVA,
  PREFIXO_SAL,
  derivarDaSenha,
  normalizarEmail,
} from "./derivacaoSenha";

describe("vetor oficial da RFC 9106 (Argon2id)", () => {
  it("reproduz o tag da seção 5.3, byte a byte", () => {
    const password = new Uint8Array(32).fill(0x01);
    const salt = new Uint8Array(16).fill(0x02);
    const key = new Uint8Array(8).fill(0x03);
    const personalization = new Uint8Array(12).fill(0x04);

    // O vetor da RFC continua rodando no Argon2id do @noble/hashes (não no hash-wasm, que
    // não aceita "secret"/"associated data") — é o único jeito de exercitar o vetor
    // completo, com K e X, para cobrir a lacuna da auditoria da Cure53.
    const tag = argon2idNoble(password, salt, {
      t: 3,
      m: 32,
      p: 4,
      dkLen: 32,
      version: 0x13,
      key,
      personalization,
    });

    const hex = Array.from(tag)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    expect(hex).toBe(
      "0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659",
    );
  });
});

describe("normalizarEmail", () => {
  it("trim + minúsculas + NFC", () => {
    expect(normalizarEmail(" Ana@Exemplo.com ")).toBe("ana@exemplo.com");
  });
});

// `derivarDaSenha` não expõe a chave mestra (só a prova e a chave de envelope, já
// separadas por HKDF) — de propósito, para não vazar a chave mestra pela API pública.
// Para conferir que o hash-wasm (implementação em produção) e o noble (implementação já
// auditada, usada só aqui como referência) calculam o MESMO Argon2id, este teste recalcula
// o sal com as constantes exportadas e chama os dois Argon2id diretamente, com os mesmos
// parâmetros do "vetor fixo do app" (sem secret/associated data — o app não usa). O noble
// roda uma única vez em `beforeAll` (leva ~4 s nesta máquina); o hash-wasm é rápido.
describe("Argon2id: noble e hash-wasm concordam na chave mestra do app", () => {
  const EMAIL = "ana@exemplo.com";
  const SENHA = "correto cavalo bateria grampo";

  let chaveMestraNoble: Uint8Array;

  beforeAll(async () => {
    const sal = sha256(utf8ToBytes(PREFIXO_SAL + normalizarEmail(EMAIL)));
    chaveMestraNoble = await argon2idNobleAsync(utf8ToBytes(SENHA.normalize("NFC")), sal, {
      m: 65536,
      t: 3,
      p: 4,
      dkLen: 32,
    });
  }, 20000);

  it("hash-wasm produz os mesmos bytes que o noble", async () => {
    const sal = sha256(utf8ToBytes(PREFIXO_SAL + normalizarEmail(EMAIL)));
    const chaveMestraHashWasm = await argon2idHashWasm({
      password: utf8ToBytes(SENHA.normalize("NFC")),
      salt: sal,
      iterations: 3,
      parallelism: 4,
      memorySize: 65536,
      hashLength: 32,
      outputType: "binary",
    });

    expect(Buffer.from(chaveMestraHashWasm)).toEqual(Buffer.from(chaveMestraNoble));
  }, 15000);
});

// A derivação real (m=65536 KiB, t=3, p=4) roda pelo hash-wasm (~0,3 s nesta máquina) — bem
// mais rápida que o Argon2id puro-TS do noble (~3,8 s), mas ainda assim um único cálculo
// compartilhado evita repetir o custo em cada `it`.
describe("derivarDaSenha (parâmetros reais do app)", () => {
  const EMAIL = "ana@exemplo.com";
  const SENHA = "correto cavalo bateria grampo";

  let resultado: Awaited<ReturnType<typeof derivarDaSenha>>;
  let tempoMs: number;

  beforeAll(async () => {
    const inicio = performance.now();
    resultado = await derivarDaSenha(EMAIL, SENHA);
    tempoMs = performance.now() - inicio;
    // eslint-disable-next-line no-console
    console.log(`[derivacaoSenha] uma derivação real levou ${tempoMs.toFixed(0)} ms`);
  }, 10000);

  it("devolve a etiqueta do kdf congelada", () => {
    expect(resultado.kdf).toBe(ETIQUETA_KDF);
  });

  it("prova de identidade e chave de envelope são diferentes (separação de domínio)", () => {
    const chaveBase64 = Buffer.from(resultado.chaveDeEnvelope).toString("base64");
    expect(resultado.provaDeIdentidade).not.toBe(chaveBase64);
  });

  it("determinismo: mesma entrada produz as mesmas saídas", async () => {
    const outra = await derivarDaSenha(EMAIL, SENHA);
    expect(outra.provaDeIdentidade).toBe(resultado.provaDeIdentidade);
    expect(Buffer.from(outra.chaveDeEnvelope)).toEqual(Buffer.from(resultado.chaveDeEnvelope));
  }, 15000);

  it("normalização de e-mail: espaços e caixa não importam", async () => {
    const outra = await derivarDaSenha(" Ana@Exemplo.com ", SENHA);
    expect(outra.provaDeIdentidade).toBe(resultado.provaDeIdentidade);
  }, 15000);

  it("normalização de senha: NFD e NFC dão o mesmo resultado", async () => {
    // "á" pode ser um único codepoint (NFC) ou "a" + acento combinante (NFD).
    const senhaNFC = "café".normalize("NFC");
    const senhaNFD = "café".normalize("NFD");
    expect(senhaNFC).not.toBe(senhaNFD); // são strings diferentes antes da normalização

    const viaNFC = await derivarDaSenha(EMAIL, senhaNFC);
    const viaNFD = await derivarDaSenha(EMAIL, senhaNFD);
    expect(viaNFD.provaDeIdentidade).toBe(viaNFC.provaDeIdentidade);
  }, 15000);

  it("senha com espaço no fim dá resultado diferente (senha nunca é `trim`)", async () => {
    const comEspaco = await derivarDaSenha(EMAIL, `${SENHA} `);
    expect(comEspaco.provaDeIdentidade).not.toBe(resultado.provaDeIdentidade);
  }, 15000);

  it("e-mails diferentes com a mesma senha geram provas diferentes (sal depende do e-mail)", async () => {
    const outraConta = await derivarDaSenha("outra@exemplo.com", SENHA);
    expect(outraConta.provaDeIdentidade).not.toBe(resultado.provaDeIdentidade);
  }, 15000);

  // Vetor fixo do próprio app: calculado uma única vez, depois de o vetor da RFC 9106 ter
  // passado, com os parâmetros congelados (m=65536, t=3, p=4, dkLen=32), o prefixo de sal
  // "excalisidian-sal-da-conta-v1:" e as etiquetas de info "excalisidian/prova-de-identidade/v1"
  // e "excalisidian/envelope-do-vault/v1".
  //
  // ATENÇÃO: mudar este valor (ou qualquer uma das constantes acima) quebra o login de
  // todas as contas existentes — o servidor guarda um hash da prova antiga, não a senha.
  it("vetor fixo do app: prova para (ana@exemplo.com, 'correto cavalo bateria grampo')", () => {
    expect(resultado.provaDeIdentidade).toBe(
      "wAtBxrUWhvuPtBqTuMDbCFZIyQgpb5v3J17xHHLwdoM=",
    );
  });
});

describe("constantes congeladas", () => {
  it("etiqueta do kdf", () => {
    expect(ETIQUETA_KDF).toBe("argon2id-m65536-t3-p4-v1");
  });

  it("prefixo do sal", () => {
    expect(PREFIXO_SAL).toBe("excalisidian-sal-da-conta-v1:");
  });

  it("info da prova de identidade", () => {
    expect(INFO_PROVA).toBe("excalisidian/prova-de-identidade/v1");
  });

  it("info da chave de envelope", () => {
    expect(INFO_ENVELOPE).toBe("excalisidian/envelope-do-vault/v1");
  });
});
