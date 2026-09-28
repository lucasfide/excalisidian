// src/sync/segundoPlano.test.ts
// Testes de `src/sync/segundoPlano.ts` (doc 17 §8.1, plano 12 Task 5): tudo por
// `DepsSegundoPlano` injetado — sem Tauri, sem servidor de verdade e sem zustand. Testa
// `executarRodada` direto (a rodada inteira, sem depender do agendamento de
// `iniciarSegundoPlano`), e `iniciarSegundoPlano` só pelo formato (roda uma vez ao instalar,
// devolve "parar").

import { describe, it, expect, vi, beforeEach } from "vitest";

import { executarRodada, iniciarSegundoPlano, type DepsSegundoPlano } from "./segundoPlano";
import type { EstadoSync } from "./estadoSync";
import type { ContextoCiclo, ResultadoCiclo } from "./motor";
import type { ServicoSync } from "./ServicoSync";

function estadoBase(idDoVault: string): EstadoSync {
  return { idDoVault, cursor: 0, bases: {}, hashesConhecidos: {}, conflitosPendentes: {} };
}

function servicoFalso(overrides: Partial<ServicoSync> = {}): ServicoSync {
  return {
    listarVaults: async () => [],
    criarVault: async () => {},
    baixar: async () => ({ lotes: [], ultimoRetrato: 0 }),
    enviarLote: async () => 0,
    enviarRetrato: async () => {},
    apagarVault: async () => {},
    ...overrides,
  };
}

function depsBase(overrides: Partial<DepsSegundoPlano> = {}): DepsSegundoPlano {
  return {
    contaCarregada: () => true,
    contaPremium: () => true,
    chaveDeEnvelopeAtual: async () => new Uint8Array([1]),
    listarRecentes: async () => [],
    carregarEstadoSync: async () => null,
    salvarEstadoSync: async () => {},
    vaultsAbertos: async () => [],
    tentarTravarSync: async () => "dono-1",
    liberarTravaSync: async () => {},
    chaveDeVault: (c) => c.toLowerCase(),
    existePasta: async () => true,
    souJanelaDesignada: async () => true,
    servico: servicoFalso(),
    abrirEnvelope: async () => new Uint8Array([2]),
    abrirAdaptador: async () => ({}) as any,
    nomeDesteComputador: async () => "Notebook do Lucas (este computador)",
    executarCiclo: async () => ({ ok: true, foraDaSincronizacao: [] }) as ResultadoCiclo,
    agora: () => new Date("2026-09-28T12:00:00.000Z"),
    ...overrides,
  };
}

describe("executarRodada", () => {
  it("só a janela designada roda: nenhuma outra chamada acontece se não for a designada", async () => {
    const listarVaults = vi.fn(async () => []);
    const carregarEstadoSync = vi.fn(async () => null);
    const deps = depsBase({
      souJanelaDesignada: async () => false,
      listarRecentes: async () => [{ caminho: "C:/Vaults/Casa" }],
      carregarEstadoSync,
      servico: servicoFalso({ listarVaults }),
    });

    await executarRodada(deps);

    expect(listarVaults).not.toHaveBeenCalled();
    expect(carregarEstadoSync).not.toHaveBeenCalled();
  });

  it("vault aberto numa janela é pulado (Review Focus 2): não trava, não sincroniza", async () => {
    const estado = estadoBase("vault-1");
    const tentarTravarSync = vi.fn(async () => "dono-1");
    const executarCiclo = vi.fn(async () => ({ ok: true, foraDaSincronizacao: [] }) as ResultadoCiclo);
    const deps = depsBase({
      listarRecentes: async () => [{ caminho: "C:/Vaults/Casa" }],
      carregarEstadoSync: async () => estado,
      vaultsAbertos: async () => ["c:/vaults/casa"],
      chaveDeVault: (c) => c.toLowerCase(),
      tentarTravarSync,
      executarCiclo,
      servico: servicoFalso({
        listarVaults: async () => [{ id: "vault-1", nomeCifrado: new Uint8Array(), envelope: new Uint8Array() }],
      }),
    });

    await executarRodada(deps);

    expect(tentarTravarSync).not.toHaveBeenCalled();
    expect(executarCiclo).not.toHaveBeenCalled();
  });

  it("trava negada pula o vault sem sincronizar", async () => {
    const estado = estadoBase("vault-1");
    const executarCiclo = vi.fn(async () => ({ ok: true, foraDaSincronizacao: [] }) as ResultadoCiclo);
    const salvarEstadoSync = vi.fn(async () => {});
    const deps = depsBase({
      listarRecentes: async () => [{ caminho: "C:/Vaults/Casa" }],
      carregarEstadoSync: async () => estado,
      tentarTravarSync: async () => null,
      executarCiclo,
      salvarEstadoSync,
      servico: servicoFalso({
        listarVaults: async () => [{ id: "vault-1", nomeCifrado: new Uint8Array(), envelope: new Uint8Array() }],
      }),
    });

    await executarRodada(deps);

    expect(executarCiclo).not.toHaveBeenCalled();
    expect(salvarEstadoSync).not.toHaveBeenCalled();
  });

  it("pasta inexistente pula o vault, sem recriar nem sincronizar", async () => {
    const estado = estadoBase("vault-1");
    const tentarTravarSync = vi.fn(async () => "dono-1");
    const executarCiclo = vi.fn(async () => ({ ok: true, foraDaSincronizacao: [] }) as ResultadoCiclo);
    const deps = depsBase({
      listarRecentes: async () => [{ caminho: "C:/Vaults/Casa" }],
      carregarEstadoSync: async () => estado,
      existePasta: async () => false,
      tentarTravarSync,
      executarCiclo,
      servico: servicoFalso({
        listarVaults: async () => [{ id: "vault-1", nomeCifrado: new Uint8Array(), envelope: new Uint8Array() }],
      }),
    });

    await executarRodada(deps);

    expect(tentarTravarSync).not.toHaveBeenCalled();
    expect(executarCiclo).not.toHaveBeenCalled();
  });

  it("conflito em segundo plano não chama nenhum efeito de tela e fica em conflitosPendentes", async () => {
    const estado = estadoBase("vault-1");
    const registrarConflitoSpy = vi.fn();
    const flushTudoSpy = vi.fn();
    const salvarEstadoSync = vi.fn(async (_raiz: string, _estado: EstadoSync) => {});

    const executarCiclo = vi.fn(async (ctx: ContextoCiclo): Promise<ResultadoCiclo> => {
      // Simula o motor encontrando um conflito: nunca deveria chamar os efeitos de tela do
      // segundo plano (eles são no-ops), e o conflito fica só em `conflitosPendentes`.
      ctx.registrarConflito({
        caminho: "nota.md",
        tipo: "nota",
        local: { origem: "local", conteudo: "a", mtimeMs: 1, dispositivo: "X" },
        remoto: { origem: "remoto", conteudo: "b", mtimeMs: 2, dispositivo: "Y" },
      });
      registrarConflitoSpy();
      await ctx.flushTudo();
      flushTudoSpy();
      expect(ctx.conflitosAbertos()).toEqual(new Set());
      // Efeitos de tela nulos: recarregar árvore/reindexar/recarregar do disco não lançam e
      // "mover pra lixeira" devolve ok sem mexer em nada de verdade.
      await expect(ctx.efeitos.recarregarArvore()).resolves.toBeUndefined();
      await expect(ctx.efeitos.moverParaLixeira("nota.md")).resolves.toEqual({ ok: true });

      ctx.estado.conflitosPendentes["nota.md"] = {
        hashRemoto: "hash-remoto",
        conteudo: "b",
        dispositivo: "Y",
        criadoEm: "2026-09-28T11:00:00.000Z",
      };
      return { ok: true, foraDaSincronizacao: [] };
    });

    const deps = depsBase({
      listarRecentes: async () => [{ caminho: "C:/Vaults/Casa" }],
      carregarEstadoSync: async () => estado,
      executarCiclo,
      salvarEstadoSync,
      servico: servicoFalso({
        listarVaults: async () => [{ id: "vault-1", nomeCifrado: new Uint8Array(), envelope: new Uint8Array() }],
      }),
    });

    await executarRodada(deps);

    // `registrarConflito`/`flushTudo` recebidos por `executarCiclo` são no-ops do segundo
    // plano — chamá-los não teve nenhum efeito observável fora deste teste (nada de árvore,
    // aba ou fila da tela).
    expect(registrarConflitoSpy).toHaveBeenCalledTimes(1);
    expect(flushTudoSpy).toHaveBeenCalledTimes(1);

    expect(salvarEstadoSync).toHaveBeenCalledTimes(1);
    const [, estadoSalvo] = salvarEstadoSync.mock.calls[0];
    expect(estadoSalvo.conflitosPendentes["nota.md"]).toBeDefined();
  });

  it("trava é liberada mesmo se o ciclo lançar uma exceção", async () => {
    const estado = estadoBase("vault-1");
    const liberarTravaSync = vi.fn(async () => {});
    const deps = depsBase({
      listarRecentes: async () => [{ caminho: "C:/Vaults/Casa" }],
      carregarEstadoSync: async () => estado,
      tentarTravarSync: async () => "dono-especial",
      liberarTravaSync,
      executarCiclo: async () => {
        throw new Error("falha inesperada");
      },
      servico: servicoFalso({
        listarVaults: async () => [{ id: "vault-1", nomeCifrado: new Uint8Array(), envelope: new Uint8Array() }],
      }),
    });

    await executarRodada(deps);

    expect(liberarTravaSync).toHaveBeenCalledWith("C:/Vaults/Casa", "dono-especial");
  });

  it("erro num vault não impede os demais de sincronizar", async () => {
    const estadoRuim = estadoBase("vault-ruim");
    const estadoBom = estadoBase("vault-bom");
    const salvarEstadoSync = vi.fn(async (_raiz: string, _estado: EstadoSync) => {});

    const deps = depsBase({
      listarRecentes: async () => [{ caminho: "C:/Vaults/Ruim" }, { caminho: "C:/Vaults/Bom" }],
      carregarEstadoSync: async (raiz) => (raiz === "C:/Vaults/Ruim" ? estadoRuim : estadoBom),
      abrirAdaptador: async (caminho) => {
        if (caminho === "C:/Vaults/Ruim") throw new Error("disco não montado");
        return {} as any;
      },
      salvarEstadoSync,
      servico: servicoFalso({
        listarVaults: async () => [
          { id: "vault-ruim", nomeCifrado: new Uint8Array(), envelope: new Uint8Array() },
          { id: "vault-bom", nomeCifrado: new Uint8Array(), envelope: new Uint8Array() },
        ],
      }),
    });

    await executarRodada(deps);

    expect(salvarEstadoSync).toHaveBeenCalledTimes(2);
    const chamadaRuim = salvarEstadoSync.mock.calls.find(([raiz]) => raiz === "C:/Vaults/Ruim")!;
    const chamadaBoa = salvarEstadoSync.mock.calls.find(([raiz]) => raiz === "C:/Vaults/Bom")!;
    expect(chamadaRuim[1].ultimoErro).not.toBeNull();
    expect(chamadaBoa[1].ultimoErro).toBeNull();
  });
});

describe("iniciarSegundoPlano", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("roda uma vez já ao instalar, mesmo sem esperar o intervalo", async () => {
    const carregarEstadoSync = vi.fn(async () => null);
    const deps = depsBase({
      listarRecentes: async () => [{ caminho: "C:/Vaults/Casa" }],
      carregarEstadoSync,
      intervaloMs: 60_000,
    });

    const parar = iniciarSegundoPlano(deps);
    try {
      await vi.waitFor(() => expect(carregarEstadoSync).toHaveBeenCalled());
    } finally {
      parar();
    }
  });

  it("parar() cancela o agendamento: nenhuma rodada nova depois disso", async () => {
    vi.useFakeTimers();
    const listarVaults = vi.fn(async () => []);
    const deps = depsBase({
      listarRecentes: async () => [],
      intervaloMs: 1000,
      servico: servicoFalso({ listarVaults }),
    });

    const parar = iniciarSegundoPlano(deps);
    await vi.advanceTimersByTimeAsync(0);
    const chamadasAntes = listarVaults.mock.calls.length;
    parar();

    await vi.advanceTimersByTimeAsync(5000);
    expect(listarVaults.mock.calls.length).toBe(chamadasAntes);
    vi.useRealTimers();
  });
});
