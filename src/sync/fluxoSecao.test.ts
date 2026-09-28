// src/sync/fluxoSecao.test.ts
// Testes do módulo puro que decide o que a seção "Sincronização" das Configurações mostra
// (plano 12 Task 6, doc 04 §17, doc 17 §7-8): qual dos quatro estados exibir, quais ações
// aparecem para cada estado de item da lista, o texto de contagem de conflitos, e qual chave do
// catálogo corresponde a um código de erro do ciclo ou a um `StatusSync`. Reescrito para a
// lista "Seus vaults" (plano 10 tinha dois ramos — "não sincronizado"/"sincronizado" — que a
// Task 6 substitui por uma lista única); `pastaEstaVazia` saiu (baixar não exige mais pasta
// vazia). Escrito ANTES da implementação (visto falhando).

import { describe, it, expect } from "vitest";

import {
  estadoDaSecaoSincronizacao,
  precisaConfirmarSenha,
  acoesDoEstado,
  chaveDeConflitos,
  chaveDeErroCiclo,
  chaveDeStatus,
} from "./fluxoSecao";

describe("estadoDaSecaoSincronizacao", () => {
  it("sem sessão: sem-conta", () => {
    expect(estadoDaSecaoSincronizacao({ sessao: null, temChave: false })).toBe("sem-conta");
    // Mesmo com a chave presente: sem sessão, a seção nunca mostra a lista (defesa em
    // profundidade — não deveria acontecer na prática).
    expect(estadoDaSecaoSincronizacao({ sessao: null, temChave: true })).toBe("sem-conta");
  });

  it("sessão grátis: gratis, mesmo com chave presente", () => {
    expect(estadoDaSecaoSincronizacao({ sessao: { plano: "gratis" }, temChave: false })).toBe(
      "gratis",
    );
    expect(estadoDaSecaoSincronizacao({ sessao: { plano: "gratis" }, temChave: true })).toBe(
      "gratis",
    );
  });

  it("premium sem chave: sem-chave", () => {
    expect(estadoDaSecaoSincronizacao({ sessao: { plano: "premium" }, temChave: false })).toBe(
      "sem-chave",
    );
  });

  it("premium com chave: lista", () => {
    expect(estadoDaSecaoSincronizacao({ sessao: { plano: "premium" }, temChave: true })).toBe(
      "lista",
    );
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

describe("acoesDoEstado", () => {
  it("sincronizado: abrir, sincronizar agora, parar neste computador, apagar da nuvem", () => {
    expect(acoesDoEstado("sincronizado")).toEqual([
      "abrir",
      "sincronizarAgora",
      "pararNesteComputador",
      "apagarDaNuvem",
    ]);
  });

  it("so-local: sincronizar", () => {
    expect(acoesDoEstado("so-local")).toEqual(["sincronizar"]);
  });

  it("so-nuvem: baixar para este computador", () => {
    expect(acoesDoEstado("so-nuvem")).toEqual(["baixarParaEsteComputador"]);
  });

  it("pasta-nao-encontrada: esquecer neste computador", () => {
    expect(acoesDoEstado("pasta-nao-encontrada")).toEqual(["esquecerNesteComputador"]);
  });

  it("outra-senha: apagar da nuvem", () => {
    expect(acoesDoEstado("outra-senha")).toEqual(["apagarDaNuvem"]);
  });
});

describe("chaveDeConflitos", () => {
  it("zero conflitos: null (a UI não mostra a linha)", () => {
    expect(chaveDeConflitos(0)).toBe(null);
  });

  it("um conflito: chave singular, sem parâmetro", () => {
    expect(chaveDeConflitos(1)).toEqual({ chave: "sync.item.conflito" });
  });

  it("vários conflitos: chave plural, com {n}", () => {
    expect(chaveDeConflitos(3)).toEqual({ chave: "sync.item.conflitos", params: { n: 3 } });
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
