// src/sync/fluxoSecao.test.ts
// Testes do módulo puro que decide o que a seção "Sincronização" das Configurações mostra
// (plano 10 Task 4, doc 04 §17): qual dos estados exibir, se a pasta escolhida para "Baixar"
// serve, se é preciso pedir a senha antes de uma ação, e qual chave do catálogo corresponde a
// um código de erro do ciclo ou a um `StatusSync`. Escrito ANTES da implementação (visto
// falhando) — nenhum destes símbolos existe ainda em `fluxoSecao.ts`.

import { describe, it, expect } from "vitest";

import {
  estadoDaSecaoSincronizacao,
  pastaEstaVazia,
  precisaConfirmarSenha,
  chaveDeErroCiclo,
  chaveDeStatus,
} from "./fluxoSecao";

describe("estadoDaSecaoSincronizacao", () => {
  it("sem sessão: sem-conta", () => {
    expect(estadoDaSecaoSincronizacao({ sessao: null, vaultSincronizado: false })).toBe(
      "sem-conta",
    );
    // Mesmo com o vault marcado como sincronizado: sem sessão, a seção nunca mostra estado
    // de vault sincronizado (defesa em profundidade — não deveria acontecer na prática).
    expect(estadoDaSecaoSincronizacao({ sessao: null, vaultSincronizado: true })).toBe(
      "sem-conta",
    );
  });

  it("sessão grátis: gratis, mesmo com vault sincronizado", () => {
    expect(
      estadoDaSecaoSincronizacao({ sessao: { plano: "gratis" }, vaultSincronizado: false }),
    ).toBe("gratis");
    expect(
      estadoDaSecaoSincronizacao({ sessao: { plano: "gratis" }, vaultSincronizado: true }),
    ).toBe("gratis");
  });

  it("premium sem vault sincronizado: nao-sincronizado", () => {
    expect(
      estadoDaSecaoSincronizacao({ sessao: { plano: "premium" }, vaultSincronizado: false }),
    ).toBe("nao-sincronizado");
  });

  it("premium com vault sincronizado: sincronizado", () => {
    expect(
      estadoDaSecaoSincronizacao({ sessao: { plano: "premium" }, vaultSincronizado: true }),
    ).toBe("sincronizado");
  });
});

describe("pastaEstaVazia", () => {
  it("pasta sem entradas está vazia", () => {
    expect(pastaEstaVazia([])).toBe(true);
  });

  it("pasta com qualquer entrada não está vazia", () => {
    expect(pastaEstaVazia([{ nome: "nota.md" }])).toBe(false);
    expect(pastaEstaVazia([{ nome: ".git" }])).toBe(false);
  });
});

describe("precisaConfirmarSenha", () => {
  it("sem chaveDeEnvelope no cofre: precisa pedir a senha", () => {
    expect(precisaConfirmarSenha(null)).toBe(true);
  });

  it("com chaveDeEnvelope no cofre: não precisa", () => {
    expect(precisaConfirmarSenha(new Uint8Array([1, 2, 3]))).toBe(false);
  });
});

describe("chaveDeErroCiclo", () => {
  it("sessao, plano e espaco têm chave própria", () => {
    expect(chaveDeErroCiclo("sessao")).toBe("sync.erro.sessao");
    expect(chaveDeErroCiclo("plano")).toBe("sync.erro.plano");
    expect(chaveDeErroCiclo("espaco")).toBe("sync.erro.espaco");
  });

  it("os demais códigos caem no erro genérico", () => {
    expect(chaveDeErroCiclo("rede")).toBe("sync.erro.generico");
    expect(chaveDeErroCiclo("servidor")).toBe("sync.erro.generico");
    expect(chaveDeErroCiclo("nao-encontrado")).toBe("sync.erro.generico");
    expect(chaveDeErroCiclo("ja-existe")).toBe("sync.erro.generico");
    expect(chaveDeErroCiclo("fora-de-ordem")).toBe("sync.erro.generico");
    expect(chaveDeErroCiclo("aplicar-lote")).toBe("sync.erro.generico");
  });
});

describe("chaveDeStatus", () => {
  it("cada status simples tem chave própria", () => {
    expect(chaveDeStatus("sincronizado")).toBe("sync.status.sincronizado");
    expect(chaveDeStatus("sincronizando")).toBe("sync.status.sincronizando");
    expect(chaveDeStatus("sem-conexao")).toBe("sync.status.semConexao");
    expect(chaveDeStatus("pausado")).toBe("sync.status.pausado");
  });

  it("desligado não tem texto de status (a seção não deveria chamar isto neste estado)", () => {
    expect(chaveDeStatus("desligado")).toBe(null);
  });

  it("status de erro usa a mesma tabela de chaveDeErroCiclo", () => {
    expect(chaveDeStatus({ erro: "sessao" })).toBe("sync.erro.sessao");
    expect(chaveDeStatus({ erro: "rede" })).toBe("sync.erro.generico");
  });
});
