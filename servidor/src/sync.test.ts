// servidor/src/sync.test.ts
// A prova da verdade é o cliente do app: estes testes rodam o `ServicoSyncHttp` de verdade
// (src/sync/ServicoSyncHttp.ts, na raiz) contra o servidor em processo, via `fetchPorInject`
// (mesmo padrão de contas.test.ts). Um teste por rota e por código de erro do doc 17 §9.1,
// mais isolamento entre contas.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

import { criarApp } from "./app";
import type { Config } from "./config";
import { fetchPorInject } from "./apoioTestes/fetchPorInject";
import { TAMANHO_MAXIMO_PACOTE } from "./armazenamentoSync";

import { ServicoContaHttp } from "../../src/conta/ServicoContaHttp";
import { ServicoSyncHttp } from "../../src/sync/ServicoSyncHttp";
import { definirTokenDaSessao } from "../../src/servico/sessao";

const BASE = "http://localhost/v1";

let pastaTemporaria: string;
let app: FastifyInstance;
let contas: ServicoContaHttp;
let sync: ServicoSyncHttp;

// `derivarDaSenha` (Argon2id) é lento — nestes testes a senha em si não importa (não
// exercitamos derivação de novo por par), então usamos sempre a mesma, deixando o cache
// implícito de `derivarDaSenha` (memoizado só por processo, não aqui) não ser o gargalo:
// cada `beforeEach` cria poucas contas.
const SENHA = "senha-de-teste-123456";

async function criarContaPremium(email: string): Promise<string> {
  const sessao = await contas.criar(email, SENHA);
  app.banco.prepare(`update contas set plano = 'premium' where email = ?`).run(email);
  return sessao.token;
}

async function criarContaGratis(email: string): Promise<string> {
  const sessao = await contas.criar(email, SENHA);
  return sessao.token;
}

beforeEach(() => {
  pastaTemporaria = fs.mkdtempSync(path.join(os.tmpdir(), "excalisidian-sync-"));
  const config: Config = { porta: 0, pastaDados: pastaTemporaria };
  app = criarApp(config);
  contas = new ServicoContaHttp(BASE, fetchPorInject(app));
  sync = new ServicoSyncHttp(BASE, fetchPorInject(app));
});

afterEach(async () => {
  definirTokenDaSessao(null);
  await app.close();
  fs.rmSync(pastaTemporaria, { recursive: true, force: true });
});

function envelopeDeTeste(): { nomeCifrado: Uint8Array; envelope: Uint8Array } {
  return { nomeCifrado: new Uint8Array([1, 2, 3]), envelope: new Uint8Array([4, 5, 6, 7]) };
}

describe("POST /v1/sync/vaults (criarVault)", () => {
  it("cria o vault e ele aparece em listarVaults", async () => {
    const token = await criarContaPremium("ana@teste.com");
    definirTokenDaSessao(token);

    const id = crypto.randomUUID();
    const { nomeCifrado, envelope } = envelopeDeTeste();
    await sync.criarVault(id, nomeCifrado, envelope);

    const vaults = await sync.listarVaults();
    expect(vaults).toHaveLength(1);
    expect(vaults[0].id).toBe(id);
    expect(vaults[0].nomeCifrado).toEqual(nomeCifrado);
    expect(vaults[0].envelope).toEqual(envelope);
  });

  it("id repetido dá ja-existe (409)", async () => {
    const token = await criarContaPremium("bruno@teste.com");
    definirTokenDaSessao(token);

    const id = crypto.randomUUID();
    const { nomeCifrado, envelope } = envelopeDeTeste();
    await sync.criarVault(id, nomeCifrado, envelope);

    await expect(sync.criarVault(id, nomeCifrado, envelope)).rejects.toThrow(
      expect.objectContaining({ codigo: "ja-existe" }),
    );
  });
});

describe("GET /v1/sync/vaults/:id/pacotes (baixar)", () => {
  it("vault vazio devolve lotes vazios e ultimoRetrato 0", async () => {
    const token = await criarContaPremium("carla@teste.com");
    definirTokenDaSessao(token);

    const id = crypto.randomUUID();
    const { nomeCifrado, envelope } = envelopeDeTeste();
    await sync.criarVault(id, nomeCifrado, envelope);

    const resultado = await sync.baixar(id, 0);
    expect(resultado.lotes).toEqual([]);
    expect(resultado.ultimoRetrato).toBe(0);
    expect(resultado.retrato).toBeUndefined();
  });

  it("id inexistente dá nao-encontrado (404)", async () => {
    const token = await criarContaPremium("davi@teste.com");
    definirTokenDaSessao(token);

    await expect(sync.baixar(crypto.randomUUID(), 0)).rejects.toThrow(
      expect.objectContaining({ codigo: "nao-encontrado" }),
    );
  });
});

describe("POST /v1/sync/vaults/:id/lotes (enviarLote)", () => {
  it("envia um lote e ele volta em baixar com os mesmos bytes", async () => {
    const token = await criarContaPremium("erika@teste.com");
    definirTokenDaSessao(token);

    const id = crypto.randomUUID();
    const { nomeCifrado, envelope } = envelopeDeTeste();
    await sync.criarVault(id, nomeCifrado, envelope);

    const bytes = new Uint8Array([9, 8, 7, 6, 5]);
    const sequencia = await sync.enviarLote(id, 0, bytes);
    expect(sequencia).toBe(1);

    const resultado = await sync.baixar(id, 0);
    expect(resultado.lotes).toEqual([{ sequencia: 1, bytes }]);
  });

  it("esperoUltima errado dá fora-de-ordem (409)", async () => {
    const token = await criarContaPremium("fabio@teste.com");
    definirTokenDaSessao(token);

    const id = crypto.randomUUID();
    const { nomeCifrado, envelope } = envelopeDeTeste();
    await sync.criarVault(id, nomeCifrado, envelope);

    await expect(sync.enviarLote(id, 5, new Uint8Array([1]))).rejects.toThrow(
      expect.objectContaining({ codigo: "fora-de-ordem" }),
    );
  });

  // monta um corpo de vários MiB; lento sob carga, não é defeito
  it("lote acima de 8 MiB + 28 bytes dá espaco (413)", async () => {
    const token = await criarContaPremium("gustavo@teste.com");
    definirTokenDaSessao(token);

    const id = crypto.randomUUID();
    const { nomeCifrado, envelope } = envelopeDeTeste();
    await sync.criarVault(id, nomeCifrado, envelope);

    const grande = new Uint8Array(TAMANHO_MAXIMO_PACOTE + 1);
    await expect(sync.enviarLote(id, 0, grande)).rejects.toThrow(
      expect.objectContaining({ codigo: "espaco" }),
    );
  }, 60000);

  it("lote exatamente no limite (8 MiB + 28 bytes) é aceito", async () => {
    const token = await criarContaPremium("helena@teste.com");
    definirTokenDaSessao(token);

    const id = crypto.randomUUID();
    const { nomeCifrado, envelope } = envelopeDeTeste();
    await sync.criarVault(id, nomeCifrado, envelope);

    const noLimite = new Uint8Array(TAMANHO_MAXIMO_PACOTE);
    const sequencia = await sync.enviarLote(id, 0, noLimite);
    expect(sequencia).toBe(1);
  });

  it("passar da cota de 5 GiB da conta dá espaco (507)", async () => {
    const token = await criarContaPremium("izabel@teste.com");
    definirTokenDaSessao(token);

    const id = crypto.randomUUID();
    const { nomeCifrado, envelope } = envelopeDeTeste();
    await sync.criarVault(id, nomeCifrado, envelope);

    // Não é razoável enviar 5 GiB de verdade num teste: infla a cota da conta direto no banco
    // (mesmo dado que a rota consultaria) e confere que o próximo envio, de qualquer tamanho,
    // é recusado por cota — sem depender do conteúdo real dos pacotes.
    const contaId = app.banco.prepare(`select conta_id as id from vaults where id = ?`).get(id) as {
      id: number;
    };
    const cincoGiB = 5 * 1024 * 1024 * 1024;
    app.banco
      .prepare(`insert into lotes (vault_id, sequencia, tamanho, caminho_arquivo) values (?, ?, ?, ?)`)
      .run(id, 999999, cincoGiB, path.join(pastaTemporaria, "fantasma.bin"));
    void contaId;

    await expect(sync.enviarLote(id, 0, new Uint8Array([1]))).rejects.toThrow(
      expect.objectContaining({ codigo: "espaco" }),
    );
  });
});

describe("POST /v1/sync/vaults/:id/retratos (enviarRetrato)", () => {
  it("envia um retrato e baixar(0) devolve ele mais os lotes seguintes", async () => {
    const token = await criarContaPremium("joao@teste.com");
    definirTokenDaSessao(token);

    const id = crypto.randomUUID();
    const { nomeCifrado, envelope } = envelopeDeTeste();
    await sync.criarVault(id, nomeCifrado, envelope);

    await sync.enviarLote(id, 0, new Uint8Array([1, 1, 1]));
    const partes = [new Uint8Array([2, 2]), new Uint8Array([3, 3, 3])];
    await sync.enviarRetrato(id, 1, partes);
    await sync.enviarLote(id, 1, new Uint8Array([4, 4, 4, 4]));

    const resultado = await sync.baixar(id, 0);
    expect(resultado.retrato).toEqual({ ateSequencia: 1, partes });
    expect(resultado.lotes).toEqual([{ sequencia: 2, bytes: new Uint8Array([4, 4, 4, 4]) }]);
    expect(resultado.ultimoRetrato).toBe(1);
  });

  it("ateSequencia menor ou igual ao retrato atual dá fora-de-ordem (409)", async () => {
    const token = await criarContaPremium("karina@teste.com");
    definirTokenDaSessao(token);

    const id = crypto.randomUUID();
    const { nomeCifrado, envelope } = envelopeDeTeste();
    await sync.criarVault(id, nomeCifrado, envelope);

    await sync.enviarLote(id, 0, new Uint8Array([1]));
    await sync.enviarRetrato(id, 1, [new Uint8Array([9])]);

    await expect(sync.enviarRetrato(id, 1, [new Uint8Array([9])])).rejects.toThrow(
      expect.objectContaining({ codigo: "fora-de-ordem" }),
    );
  });

  it("parte de retrato acima de 8 MiB + 28 bytes dá espaco (413)", async () => {
    const token = await criarContaPremium("lucia@teste.com");
    definirTokenDaSessao(token);

    const id = crypto.randomUUID();
    const { nomeCifrado, envelope } = envelopeDeTeste();
    await sync.criarVault(id, nomeCifrado, envelope);
    await sync.enviarLote(id, 0, new Uint8Array([1]));

    const parteGrande = new Uint8Array(TAMANHO_MAXIMO_PACOTE + 1);
    await expect(sync.enviarRetrato(id, 1, [parteGrande])).rejects.toThrow(
      expect.objectContaining({ codigo: "espaco" }),
    );
  });
});

describe("DELETE /v1/sync/vaults/:id (apagarVault)", () => {
  it("apaga o vault, os arquivos somem e a cota é liberada", async () => {
    const token = await criarContaPremium("marcos@teste.com");
    definirTokenDaSessao(token);

    const id = crypto.randomUUID();
    const { nomeCifrado, envelope } = envelopeDeTeste();
    await sync.criarVault(id, nomeCifrado, envelope);
    await sync.enviarLote(id, 0, new Uint8Array(1024).fill(7));

    const pastaDoVault = path.join(pastaTemporaria, "pacotes", id);
    expect(fs.existsSync(pastaDoVault)).toBe(true);
    expect(fs.readdirSync(pastaDoVault).length).toBeGreaterThan(0);

    await sync.apagarVault(id);

    expect(await sync.listarVaults()).toEqual([]);
    // A pasta (ou os arquivos dentro dela) não sobrevivem ao apagar — libera a cota de disco.
    expect(fs.existsSync(pastaDoVault)).toBe(false);

    const contaId = app.banco.prepare(`select id from contas where email = ?`).get("marcos@teste.com") as {
      id: number;
    };
    const linha = app.banco
      .prepare(
        `select coalesce(sum(l.tamanho), 0) as soma from lotes l join vaults v on v.id = l.vault_id where v.conta_id = ?`,
      )
      .get(contaId.id) as { soma: number };
    expect(linha.soma).toBe(0);
  });
});

describe("401 — sem sessão", () => {
  it("qualquer rota de sincronização sem token dá sessao", async () => {
    definirTokenDaSessao(null);
    await expect(sync.listarVaults()).rejects.toThrow(expect.objectContaining({ codigo: "sessao" }));
  });

  it("token inexistente também dá sessao", async () => {
    definirTokenDaSessao("token-que-nunca-existiu");
    await expect(sync.listarVaults()).rejects.toThrow(expect.objectContaining({ codigo: "sessao" }));
  });
});

describe("403 — conta grátis", () => {
  it("conta sem plano premium dá plano em qualquer rota de sincronização", async () => {
    const token = await criarContaGratis("nadia@teste.com");
    definirTokenDaSessao(token);

    await expect(sync.listarVaults()).rejects.toThrow(expect.objectContaining({ codigo: "plano" }));
    await expect(sync.criarVault(crypto.randomUUID(), new Uint8Array([1]), new Uint8Array([2]))).rejects.toThrow(
      expect.objectContaining({ codigo: "plano" }),
    );
  });
});

describe("isolamento entre contas", () => {
  it("um vault de outra conta é nao-encontrado (404), nunca aparece na listagem, e apagar não o afeta", async () => {
    const tokenA = await criarContaPremium("otavio@teste.com");
    definirTokenDaSessao(tokenA);
    const idDoVaultDeA = crypto.randomUUID();
    const { nomeCifrado, envelope } = envelopeDeTeste();
    await sync.criarVault(idDoVaultDeA, nomeCifrado, envelope);
    await sync.enviarLote(idDoVaultDeA, 0, new Uint8Array([1, 2, 3]));

    const tokenB = await criarContaPremium("patricia@teste.com");
    definirTokenDaSessao(tokenB);

    // B não vê o vault de A na listagem.
    expect(await sync.listarVaults()).toEqual([]);

    // B não consegue baixar, enviar lote nem apagar o vault de A — sempre nao-encontrado.
    await expect(sync.baixar(idDoVaultDeA, 0)).rejects.toThrow(
      expect.objectContaining({ codigo: "nao-encontrado" }),
    );
    await expect(sync.enviarLote(idDoVaultDeA, 0, new Uint8Array([9]))).rejects.toThrow(
      expect.objectContaining({ codigo: "nao-encontrado" }),
    );

    // "Apagar" o id de A a partir de B não faz nada (idempotente, sem tocar no vault de A).
    await sync.apagarVault(idDoVaultDeA);

    definirTokenDaSessao(tokenA);
    const vaultsDeA = await sync.listarVaults();
    expect(vaultsDeA).toHaveLength(1);
    expect(vaultsDeA[0].id).toBe(idDoVaultDeA);
    const resultado = await sync.baixar(idDoVaultDeA, 0);
    expect(resultado.lotes).toHaveLength(1);
  });
});
