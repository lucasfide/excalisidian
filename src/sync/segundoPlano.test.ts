// src/sync/segundoPlano.test.ts
// Testes de `src/sync/segundoPlano.ts` (doc 17 §8.1, plano 12 Task 5): tudo por
// `DepsSegundoPlano` injetado — sem Tauri, sem servidor de verdade e sem zustand. Testa
// `executarRodada` direto (a rodada inteira, sem depender do agendamento de
// `iniciarSegundoPlano`), e `iniciarSegundoPlano` só pelo formato (roda uma vez ao instalar,
// devolve "parar").

import { describe, it, expect, vi, beforeEach } from "vitest";

import { executarRodada, iniciarSegundoPlano, rodarVault, type DepsSegundoPlano } from "./segundoPlano";
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

  it("vault aberto numa janela é pulado (Review Focus 2): trava, confere, libera, não sincroniza", async () => {
    const estado = estadoBase("vault-1");
    const tentarTravarSync = vi.fn(async () => "dono-1");
    const liberarTravaSync = vi.fn(async () => {});
    const executarCiclo = vi.fn(async () => ({ ok: true, foraDaSincronizacao: [] }) as ResultadoCiclo);
    const deps = depsBase({
      listarRecentes: async () => [{ caminho: "C:/Vaults/Casa" }],
      carregarEstadoSync: async () => estado,
      vaultsAbertos: async () => ["c:/vaults/casa"],
      chaveDeVault: (c) => c.toLowerCase(),
      tentarTravarSync,
      liberarTravaSync,
      executarCiclo,
      servico: servicoFalso({
        listarVaults: async () => [{ id: "vault-1", nomeCifrado: new Uint8Array(), envelope: new Uint8Array() }],
      }),
    });

    await executarRodada(deps);

    // A trava é obtida ANTES de conferir se está aberto (revisão pós-commit d9346a7: o
    // `vaultsAbertos()` fresco só faz sentido consultado depois de já ter a trava) — mas o
    // vault continua não sincronizando, e a trava é liberada de volta.
    expect(tentarTravarSync).toHaveBeenCalledWith("C:/Vaults/Casa");
    expect(liberarTravaSync).toHaveBeenCalledWith("C:/Vaults/Casa", "dono-1");
    expect(executarCiclo).not.toHaveBeenCalled();
  });

  it("vault que abre numa janela DEPOIS do início da rodada, antes da sua vez, é pulado e a trava é liberada", async () => {
    const estadoA = estadoBase("vault-a");
    const estadoB = estadoBase("vault-b");
    const executarCiclo = vi.fn(async () => ({ ok: true, foraDaSincronizacao: [] }) as ResultadoCiclo);
    const liberarTravaSync = vi.fn(async (_caminho: string, _dono: string) => {});
    // `vaultsAbertos()` é consultado de novo para CADA vault (depois da trava) — não uma lista
    // só pega no início da rodada. Na primeira consulta (vez do vault A) ninguém abriu nada
    // ainda; na segunda (vez do vault B, "durante" a rodada) o vault B acabou de abrir numa
    // janela.
    const vaultsAbertos = vi
      .fn<() => Promise<string[]>>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(["c:/vaults/b"]);

    const deps = depsBase({
      listarRecentes: async () => [{ caminho: "C:/Vaults/A" }, { caminho: "C:/Vaults/B" }],
      carregarEstadoSync: async (raiz) => (raiz === "C:/Vaults/A" ? estadoA : estadoB),
      chaveDeVault: (c) => c.toLowerCase().replace(/\\/g, "/"),
      vaultsAbertos,
      executarCiclo,
      liberarTravaSync,
      servico: servicoFalso({
        listarVaults: async () => [
          { id: "vault-a", nomeCifrado: new Uint8Array(), envelope: new Uint8Array() },
          { id: "vault-b", nomeCifrado: new Uint8Array(), envelope: new Uint8Array() },
        ],
      }),
    });

    await executarRodada(deps);

    // Vault A sincronizou normalmente (não estava aberto na hora da sua checagem).
    expect(executarCiclo).toHaveBeenCalledTimes(1);
    // Vault B teve a trava obtida E liberada, mas não chegou a sincronizar — foi pulado pela
    // checagem fresca de `vaultsAbertos()`, feita depois da trava.
    expect(liberarTravaSync).toHaveBeenCalledWith("C:/Vaults/B", expect.any(String));
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

describe("rodarVault", () => {
  // Task 6 (revisão pós-commit 3d536f5): `rodarVault` é exportada para "Sincronizar agora" da
  // lista "Seus vaults" (`SecaoSincronizacao.tsx`) reaproveitar, num vault fechado nesta janela,
  // em vez de duplicar a trava/efeitos-nulos/`executarCiclo`. Testada direto, fora de
  // `executarRodada` — só o subconjunto de deps de `DepsRodarVault` é necessário (um
  // `DepsSegundoPlano` completo, via `depsBase()`, também serve: é estrutural).

  it("sincroniza o vault: trava, roda o ciclo, grava ultimoCicloEm/ultimoErro, libera a trava", async () => {
    const estado = estadoBase("vault-1");
    const tentarTravarSync = vi.fn(async () => "dono-1");
    const liberarTravaSync = vi.fn(async () => {});
    const executarCiclo = vi.fn(async () => ({ ok: true, foraDaSincronizacao: [] }) as ResultadoCiclo);
    const salvarEstadoSync = vi.fn(async (_raiz: string, _estado: EstadoSync) => {});
    const deps = depsBase({
      carregarEstadoSync: async () => estado,
      tentarTravarSync,
      liberarTravaSync,
      executarCiclo,
      salvarEstadoSync,
    });

    await rodarVault(
      deps,
      "C:/Vaults/Casa",
      [{ id: "vault-1", envelope: new Uint8Array() }],
      new Uint8Array([1]),
      "Notebook do Lucas (este computador)",
      () => new Date("2026-09-28T12:00:00.000Z"),
    );

    expect(tentarTravarSync).toHaveBeenCalledWith("C:/Vaults/Casa");
    expect(executarCiclo).toHaveBeenCalledTimes(1);
    expect(salvarEstadoSync).toHaveBeenCalledTimes(1);
    const [, estadoSalvo] = salvarEstadoSync.mock.calls[0];
    expect(estadoSalvo.ultimoCicloEm).toBe("2026-09-28T12:00:00.000Z");
    expect(estadoSalvo.ultimoErro).toBeNull();
    expect(liberarTravaSync).toHaveBeenCalledWith("C:/Vaults/Casa", "dono-1");
  });

  it("vault aberto em outra janela: pula sem sincronizar, mas ainda libera a trava (Review Focus 2)", async () => {
    const estado = estadoBase("vault-1");
    const executarCiclo = vi.fn(async () => ({ ok: true, foraDaSincronizacao: [] }) as ResultadoCiclo);
    const liberarTravaSync = vi.fn(async () => {});
    const salvarEstadoSync = vi.fn(async () => {});
    const deps = depsBase({
      carregarEstadoSync: async () => estado,
      vaultsAbertos: async () => ["c:/vaults/casa"],
      chaveDeVault: (c) => c.toLowerCase(),
      executarCiclo,
      liberarTravaSync,
      salvarEstadoSync,
    });

    await rodarVault(
      deps,
      "C:/Vaults/Casa",
      [{ id: "vault-1", envelope: new Uint8Array() }],
      new Uint8Array([1]),
      "Notebook do Lucas (este computador)",
      () => new Date("2026-09-28T12:00:00.000Z"),
    );

    expect(executarCiclo).not.toHaveBeenCalled();
    expect(salvarEstadoSync).not.toHaveBeenCalled();
    expect(liberarTravaSync).toHaveBeenCalledWith("C:/Vaults/Casa", expect.any(String));
  });

  it("abrirEnvelope falha (vault criado com outra senha): marca ultimoErro 'outra-senha', não roda o ciclo", async () => {
    const estado = estadoBase("vault-1");
    const executarCiclo = vi.fn(async () => ({ ok: true, foraDaSincronizacao: [] }) as ResultadoCiclo);
    const salvarEstadoSync = vi.fn(async (_raiz: string, _estado: EstadoSync) => {});
    const deps = depsBase({
      carregarEstadoSync: async () => estado,
      abrirEnvelope: async () => {
        throw new Error("envelope inválido");
      },
      executarCiclo,
      salvarEstadoSync,
    });

    await rodarVault(
      deps,
      "C:/Vaults/Casa",
      [{ id: "vault-1", envelope: new Uint8Array() }],
      new Uint8Array([1]),
      "Notebook do Lucas (este computador)",
      () => new Date("2026-09-28T12:00:00.000Z"),
    );

    expect(executarCiclo).not.toHaveBeenCalled();
    expect(salvarEstadoSync).toHaveBeenCalledTimes(1);
    const [, estadoSalvo] = salvarEstadoSync.mock.calls[0];
    expect(estadoSalvo.ultimoErro).toBe("outra-senha");
  });

  it("pasta inexistente: pula sem travar nem sincronizar", async () => {
    const estado = estadoBase("vault-1");
    const tentarTravarSync = vi.fn(async () => "dono-1");
    const executarCiclo = vi.fn(async () => ({ ok: true, foraDaSincronizacao: [] }) as ResultadoCiclo);
    const deps = depsBase({
      carregarEstadoSync: async () => estado,
      existePasta: async () => false,
      tentarTravarSync,
      executarCiclo,
    });

    await rodarVault(
      deps,
      "C:/Vaults/Sumiu",
      [{ id: "vault-1", envelope: new Uint8Array() }],
      new Uint8Array([1]),
      "Notebook do Lucas (este computador)",
      () => new Date("2026-09-28T12:00:00.000Z"),
    );

    expect(tentarTravarSync).not.toHaveBeenCalled();
    expect(executarCiclo).not.toHaveBeenCalled();
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
