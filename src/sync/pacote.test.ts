// src/sync/pacote.test.ts
import { describe, it, expect } from "vitest";

import {
  ESCADA,
  preencher,
  despreencher,
  gerarChaveDoVault,
  lacrar,
  abrir,
  aadDe,
  envelopar,
  abrirEnvelope,
  PacoteInvalido,
} from "./pacote";

describe("preencher / despreencher", () => {
  it("ida e volta preserva os bytes originais", () => {
    const original = new TextEncoder().encode("olá, mundo");
    const preenchido = preencher(original);
    expect(despreencher(preenchido)).toEqual(original);
  });

  it("sobe para o próximo degrau da escada", () => {
    const original = new Uint8Array(10);
    const preenchido = preencher(original);
    expect(preenchido.byteLength).toBe(ESCADA[0]);
  });

  it("exatamente o limite de um degrau sobe para o próximo (precisa de espaço pro 0x80)", () => {
    // Um conteúdo do tamanho exato de um degrau não cabe nele mesmo (falta o 0x80),
    // então deve subir para o próximo degrau.
    const original = new Uint8Array(ESCADA[0]);
    const preenchido = preencher(original);
    expect(preenchido.byteLength).toBe(ESCADA[1]);
  });

  it("conteúdo maior que 8 MiB lança", () => {
    const maiorQueOMaiorDegrau = new Uint8Array(ESCADA[ESCADA.length - 1] + 1);
    expect(() => preencher(maiorQueOMaiorDegrau)).toThrow();
  });

  it("despreencher lança se não houver marcador 0x80", () => {
    const semMarcador = new Uint8Array(ESCADA[0]);
    expect(() => despreencher(semMarcador)).toThrow();
  });

  it("despreencher lança se houver lixo não-zero depois do 0x80", () => {
    const bytes = new Uint8Array(ESCADA[0]);
    bytes[5] = 0x80;
    bytes[6] = 0x01; // devia ser 0x00
    expect(() => despreencher(bytes)).toThrow();
  });
});

describe("gerarChaveDoVault", () => {
  it("gera 32 bytes", async () => {
    const chave = await gerarChaveDoVault();
    expect(chave.byteLength).toBe(32);
  });

  it("duas chamadas geram chaves diferentes", async () => {
    const a = await gerarChaveDoVault();
    const b = await gerarChaveDoVault();
    expect(a).not.toEqual(b);
  });
});

describe("lacrar / abrir", () => {
  const aad = aadDe("vault-1", "lote", 1);

  it("ida e volta devolve os dados originais", async () => {
    const chave = await gerarChaveDoVault();
    const dados = new TextEncoder().encode("conteúdo confidencial, com acentos: ção");
    const pacote = await lacrar(chave, dados, aad);
    const aberto = await abrir(chave, pacote, aad);
    expect(aberto).toEqual(dados);
  });

  it("tamanho final = degrau + 12 (nonce) + 16 (tag)", async () => {
    const chave = await gerarChaveDoVault();
    const dados = new Uint8Array(10);
    const pacote = await lacrar(chave, dados, aad);
    expect(pacote.byteLength).toBe(ESCADA[0] + 12 + 16);
  });

  it("um byte trocado no pacote não abre", async () => {
    const chave = await gerarChaveDoVault();
    const dados = new TextEncoder().encode("dados");
    const pacote = await lacrar(chave, dados, aad);
    const corrompido = pacote.slice();
    corrompido[corrompido.length - 1] ^= 0xff;
    await expect(abrir(chave, corrompido, aad)).rejects.toThrow(PacoteInvalido);
  });

  it("aad de outro vault não abre", async () => {
    const chave = await gerarChaveDoVault();
    const dados = new TextEncoder().encode("dados");
    const pacote = await lacrar(chave, dados, aad);
    await expect(abrir(chave, pacote, aadDe("vault-2", "lote", 1))).rejects.toThrow(
      PacoteInvalido,
    );
  });

  it("aad de outro tipo não abre", async () => {
    const chave = await gerarChaveDoVault();
    const dados = new TextEncoder().encode("dados");
    const pacote = await lacrar(chave, dados, aad);
    await expect(abrir(chave, pacote, aadDe("vault-1", "retrato", 1))).rejects.toThrow(
      PacoteInvalido,
    );
  });

  it("aad de outro índice não abre", async () => {
    const chave = await gerarChaveDoVault();
    const dados = new TextEncoder().encode("dados");
    const pacote = await lacrar(chave, dados, aad);
    await expect(abrir(chave, pacote, aadDe("vault-1", "lote", 2))).rejects.toThrow(
      PacoteInvalido,
    );
  });

  it("chave errada não abre", async () => {
    const chave = await gerarChaveDoVault();
    const outraChave = await gerarChaveDoVault();
    const dados = new TextEncoder().encode("dados");
    const pacote = await lacrar(chave, dados, aad);
    await expect(abrir(outraChave, pacote, aad)).rejects.toThrow(PacoteInvalido);
  });

  it("duas lacradas do mesmo conteúdo dão bytes diferentes (nonce aleatório)", async () => {
    const chave = await gerarChaveDoVault();
    const dados = new TextEncoder().encode("mesmo conteúdo");
    const a = await lacrar(chave, dados, aad);
    const b = await lacrar(chave, dados, aad);
    expect(a).not.toEqual(b);
  });

  it("PacoteInvalido não carrega texto do conteúdo nem detalhe interno", async () => {
    const chave = await gerarChaveDoVault();
    const dados = new TextEncoder().encode("segredo que não pode vazar na mensagem de erro");
    const pacote = await lacrar(chave, dados, aad);
    const corrompido = pacote.slice();
    corrompido[0] ^= 0xff;
    try {
      await abrir(chave, corrompido, aad);
      throw new Error("deveria ter lançado");
    } catch (erro) {
      expect(erro).toBeInstanceOf(PacoteInvalido);
      const mensagem = (erro as Error).message;
      expect(mensagem).not.toContain("segredo");
      expect(mensagem.length).toBeLessThan(200);
    }
  });
});

describe("aadDe", () => {
  it("é estável para os mesmos parâmetros", () => {
    const a = aadDe("vault-1", "lote", 3);
    const b = aadDe("vault-1", "lote", 3);
    expect(a).toEqual(b);
  });

  it("usa o prefixo literal congelado, não o APP_ID", () => {
    const bytes = aadDe("vault-1", "nome");
    const texto = new TextDecoder().decode(bytes);
    expect(texto.startsWith("excalisidian-sync-v1|")).toBe(true);
  });
});

describe("envelopar / abrirEnvelope", () => {
  it("ida e volta devolve a chaveDoVault original", async () => {
    const chaveDeEnvelope = await gerarChaveDoVault();
    const chaveDoVault = await gerarChaveDoVault();
    const envelope = await envelopar(chaveDeEnvelope, chaveDoVault, "vault-1");
    const aberta = await abrirEnvelope(chaveDeEnvelope, envelope, "vault-1");
    expect(aberta).toEqual(chaveDoVault);
  });

  it("envelope de outro vault não abre", async () => {
    const chaveDeEnvelope = await gerarChaveDoVault();
    const chaveDoVault = await gerarChaveDoVault();
    const envelope = await envelopar(chaveDeEnvelope, chaveDoVault, "vault-1");
    await expect(abrirEnvelope(chaveDeEnvelope, envelope, "vault-2")).rejects.toThrow(
      PacoteInvalido,
    );
  });
});
