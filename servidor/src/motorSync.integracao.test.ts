// servidor/src/motorSync.integracao.test.ts
// A prova da verdade é o motor de sincronização de verdade (src/sync/motor.ts, na raiz)
// falando com o SERVIDOR DE VERDADE em processo através do `ServicoSyncHttp` real — mesmo
// padrão de sync.test.ts, mas exercitando `executarCiclo`/`iniciarVault`/`baixarVault` com
// dois `VaultAdapterMemoria` (dois "computadores" da mesma conta premium), em vez de
// `ServicoSyncFake`. Modelo: src/sync/motor.integracao.test.ts (que usa o fake) — aqui os
// mesmos cenários (criar, editar, conflito, apagar, retrato) rodam contra HTTP de verdade.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

import { criarApp } from "./app";
import type { Config } from "./config";
import { fetchPorInject } from "./apoioTestes/fetchPorInject";

import { ServicoContaHttp } from "../../src/conta/ServicoContaHttp";
import { ServicoSyncHttp } from "../../src/sync/ServicoSyncHttp";
import { definirTokenDaSessao } from "../../src/servico/sessao";
import { executarCiclo, iniciarVault, baixarVault, type ContextoCiclo } from "../../src/sync/motor";
import { VaultAdapterMemoria } from "../../src/vault/VaultAdapterMemoria";
import type { VaultAdapter } from "../../src/vault/VaultAdapter";
import { caminhoLivre } from "../../src/vault/criar";
import { nomeBase } from "../../src/vault/caminhos";
import type { EstadoSync } from "../../src/sync/estadoSync";
import type { EfeitosDeGravacao } from "../../src/vault/efeitosDeGravacao";
import type { Conflito } from "../../src/sync/tipos";

const BASE = "http://localhost/v1";

let pastaTemporaria: string;
let app: FastifyInstance;
let contas: ServicoContaHttp;
let servico: ServicoSyncHttp;

beforeEach(async () => {
  pastaTemporaria = fs.mkdtempSync(path.join(os.tmpdir(), "excalisidian-motor-sync-"));
  const config: Config = { porta: 0, pastaDados: pastaTemporaria };
  app = criarApp(config);
  contas = new ServicoContaHttp(BASE, fetchPorInject(app));
  servico = new ServicoSyncHttp(BASE, fetchPorInject(app));

  // Uma conta premium só, compartilhada pelos "computadores" do teste — sincronização é por
  // CONTA (vários dispositivos, uma sessão cada na vida real; aqui um token só é suficiente,
  // porque o que se está testando é o diário do vault, não a autenticação).
  const { sessao } = await contas.criar("equipe@teste.com", "senha-de-teste-123456");
  app.banco.prepare(`update contas set plano = 'premium' where email = ?`).run("equipe@teste.com");
  definirTokenDaSessao(sessao.token);
});

afterEach(async () => {
  definirTokenDaSessao(null);
  await app.close();
  fs.rmSync(pastaTemporaria, { recursive: true, force: true });
});

// --- infraestrutura de teste, igual a src/sync/motor.integracao.test.ts (dublês de efeitos e
// fila de conflitos) — repetida aqui porque este arquivo mora em servidor/, sem acesso ao
// helper interno do outro arquivo de teste. ---

function efeitosFalsos(adaptador: VaultAdapter) {
  const chamadas: string[] = [];
  return {
    recarregarArvore: vi.fn(async () => {
      chamadas.push("recarregarArvore");
    }),
    reindexarArquivo: vi.fn(async (caminho: string) => {
      chamadas.push(`reindexarArquivo:${caminho}`);
    }),
    cancelarAutosavePendente: vi.fn((caminho: string) => {
      chamadas.push(`cancelarAutosavePendente:${caminho}`);
    }),
    recarregarDoDisco: vi.fn(async (caminho: string) => {
      chamadas.push(`recarregarDoDisco:${caminho}`);
    }),
    moverParaLixeira: vi.fn(async (caminho: string) => {
      chamadas.push(`moverParaLixeira:${caminho}`);
      await adaptador.criarPasta(".trash");
      const destino = await caminhoLivre(`.trash/${nomeBase(caminho)}`, "", adaptador);
      await adaptador.mover(caminho, destino);
      return { ok: true } as const;
    }),
    chamadas,
  } satisfies EfeitosDeGravacao & { chamadas: string[] };
}

function filaDeConflitosFalsa() {
  const abertos = new Set<string>();
  const conflitos = new Map<string, Conflito>();
  return {
    abertos,
    registrar: (c: Conflito) => {
      abertos.add(c.caminho);
      conflitos.set(c.caminho, c);
    },
    conflitoDe: (caminho: string) => conflitos.get(caminho),
  };
}

interface Computador {
  nome: string;
  adaptador: VaultAdapterMemoria;
  efeitos: ReturnType<typeof efeitosFalsos>;
  fila: ReturnType<typeof filaDeConflitosFalsa>;
}

function novoComputador(nome: string): Computador {
  const adaptador = new VaultAdapterMemoria();
  return { nome, adaptador, efeitos: efeitosFalsos(adaptador), fila: filaDeConflitosFalsa() };
}

function ctxDe(comp: Computador, chave: Uint8Array, estado: EstadoSync, opcoes: { limiarRetrato?: { lotes: number } } = {}): ContextoCiclo {
  return {
    adaptador: comp.adaptador,
    servico,
    chave,
    estado,
    efeitos: comp.efeitos,
    nomeDesteComputador: comp.nome,
    registrarConflito: comp.fila.registrar,
    flushTudo: async () => ({ falhas: [], bloqueados: [] }),
    conflitosAbertos: () => comp.fila.abertos,
    limiarRetrato: opcoes.limiarRetrato,
  };
}

async function configurarParSincronizado() {
  const chaveDeEnvelope = new Uint8Array(32).fill(11);

  const compA = novoComputador("Computador A");
  const { estado: estadoA, chaveDoVault } = await iniciarVault({
    adaptador: compA.adaptador,
    servico,
    chaveDeEnvelope,
    nomeDoVault: "Vault de teste",
    nomeDesteComputador: compA.nome,
  });

  const [{ id, envelope }] = await servico.listarVaults();

  const compB = novoComputador("Computador B");
  const estadoB = await baixarVault({
    adaptador: compB.adaptador,
    servico,
    chaveDeEnvelope,
    idDoVault: id,
    envelope,
    efeitos: compB.efeitos,
    nomeDesteComputador: compB.nome,
    registrarConflito: compB.fila.registrar,
    flushTudo: async () => ({ falhas: [], bloqueados: [] }),
  });

  return { chaveDeEnvelope, chaveDoVault, idDoVault: id, compA, estadoA, compB, estadoB };
}

async function ciclo(comp: Computador, chave: Uint8Array, estado: EstadoSync) {
  const resultado = await executarCiclo(ctxDe(comp, chave, estado));
  expect(resultado.ok).toBe(true);
  return resultado;
}

describe("motor contra o servidor de verdade — criar em A aparece em B", () => {
  it("nota nova em A chega em B com o mesmo conteúdo", async () => {
    const { chaveDoVault, compA, estadoA, compB, estadoB } = await configurarParSincronizado();

    await compA.adaptador.escreverTexto("bem-vinda.md", "# Bem-vinda\n\nprimeira nota");
    await ciclo(compA, chaveDoVault, estadoA);
    await ciclo(compB, chaveDoVault, estadoB);

    expect(await compB.adaptador.lerTexto("bem-vinda.md")).toBe("# Bem-vinda\n\nprimeira nota");
    expect(compB.efeitos.recarregarArvore).toHaveBeenCalled();
    expect(estadoB.bases["bem-vinda.md"]).toBe(estadoA.bases["bem-vinda.md"]);
  });
});

describe("motor contra o servidor de verdade — editar em A atualiza B", () => {
  it("edição em A chega em B", async () => {
    const { chaveDoVault, compA, estadoA, compB, estadoB } = await configurarParSincronizado();

    await compA.adaptador.escreverTexto("nota.md", "versão 1");
    await ciclo(compA, chaveDoVault, estadoA);
    await ciclo(compB, chaveDoVault, estadoB);

    await compA.adaptador.escreverTexto("nota.md", "versão 2");
    await ciclo(compA, chaveDoVault, estadoA);
    await ciclo(compB, chaveDoVault, estadoB);

    expect(await compB.adaptador.lerTexto("nota.md")).toBe("versão 2");
  });
});

describe("motor contra o servidor de verdade — editar nos dois vira conflito em B", () => {
  it("as duas versões certas aparecem no conflito, nada é sobrescrito", async () => {
    const { chaveDoVault, compA, estadoA, compB, estadoB } = await configurarParSincronizado();

    await compA.adaptador.escreverTexto("nota.md", "original");
    await ciclo(compA, chaveDoVault, estadoA);
    await ciclo(compB, chaveDoVault, estadoB);

    await compB.adaptador.escreverTexto("nota.md", "editado em B");
    await compA.adaptador.escreverTexto("nota.md", "editado em A");

    await ciclo(compA, chaveDoVault, estadoA);
    const resultado = await executarCiclo(ctxDe(compB, chaveDoVault, estadoB));

    expect(resultado.ok).toBe(true);
    expect(await compB.adaptador.lerTexto("nota.md")).toBe("editado em B");
    expect(compB.fila.abertos.has("nota.md")).toBe(true);
    const conflito = compB.fila.conflitoDe("nota.md")!;
    expect(conflito.local.conteudo).toBe("editado em B");
    expect(conflito.remoto.conteudo).toBe("editado em A");
    expect(estadoB.conflitosPendentes["nota.md"]).toBeDefined();
  });
});

describe("motor contra o servidor de verdade — apagar em A com edição em B mantém a nota", () => {
  it("a nota editada em B volta para A (apagar nunca vence editar)", async () => {
    const { chaveDoVault, compA, estadoA, compB, estadoB } = await configurarParSincronizado();

    await compA.adaptador.escreverTexto("nota.md", "conteúdo original");
    await ciclo(compA, chaveDoVault, estadoA);
    await ciclo(compB, chaveDoVault, estadoB);

    await compB.adaptador.escreverTexto("nota.md", "editado em B antes do apagar");
    await ciclo(compB, chaveDoVault, estadoB);

    await compA.adaptador.remover("nota.md");
    await ciclo(compA, chaveDoVault, estadoA);

    const resultadoB = await executarCiclo(ctxDe(compB, chaveDoVault, estadoB));
    expect(resultadoB.ok).toBe(true);
    expect(await compB.adaptador.existe("nota.md")).toBe(true);
    expect(await compB.adaptador.lerTexto("nota.md")).toBe("editado em B antes do apagar");

    const resultadoA = await executarCiclo(ctxDe(compA, chaveDoVault, estadoA));
    expect(resultadoA.ok).toBe(true);
    expect(await compA.adaptador.existe("nota.md")).toBe(true);
    expect(await compA.adaptador.lerTexto("nota.md")).toBe("editado em B antes do apagar");
  });
});

describe("motor contra o servidor de verdade — computador novo baixa por retrato", () => {
  it("C recebe o conteúdo antigo (via retrato) e o conteúdo novo (via lotes seguintes)", async () => {
    const { chaveDeEnvelope, chaveDoVault, idDoVault, compA, estadoA, compB, estadoB } =
      await configurarParSincronizado();

    await compA.adaptador.escreverTexto("velha.md", "conteúdo velho, vai pro retrato");
    await ciclo(compA, chaveDoVault, estadoA);
    await ciclo(compB, chaveDoVault, estadoB);

    // Força o retrato automático com um limiar pequeno (na vida real só depois de 200 lotes,
    // doc 17 §9) — precisa de uma mudança pra disparar (o retrato só é tentado depois de
    // ENVIAR algo com sucesso).
    await compA.adaptador.escreverTexto("gatilho.md", "só pra ter algo pra enviar");
    const comRetrato = await executarCiclo(ctxDe(compA, chaveDoVault, estadoA, { limiarRetrato: { lotes: 1 } }));
    expect(comRetrato.ok).toBe(true);

    await compA.adaptador.escreverTexto("nova.md", "conteúdo novo, vai como lote depois do retrato");
    await ciclo(compA, chaveDoVault, estadoA);

    const compC = novoComputador("Computador C");
    const [{ envelope }] = await servico.listarVaults();
    const estadoC = await baixarVault({
      adaptador: compC.adaptador,
      servico,
      chaveDeEnvelope,
      idDoVault,
      envelope,
      efeitos: compC.efeitos,
      nomeDesteComputador: compC.nome,
      registrarConflito: compC.fila.registrar,
      flushTudo: async () => ({ falhas: [], bloqueados: [] }),
    });

    expect(await compC.adaptador.lerTexto("velha.md")).toBe("conteúdo velho, vai pro retrato");
    expect(await compC.adaptador.lerTexto("gatilho.md")).toBe("só pra ter algo pra enviar");
    expect(await compC.adaptador.lerTexto("nova.md")).toBe("conteúdo novo, vai como lote depois do retrato");
    expect(estadoC.cursor).toBe(estadoA.cursor);
    expect(compC.efeitos.recarregarArvore).toHaveBeenCalled();
  });
});
