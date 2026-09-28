// src/estado/syncStore.test.ts
// Testes do agendador e do status da sincronização (plano 09 Task 5). Não usa o motor de
// verdade nem o zustand dos outros stores: `executarCiclo` entra como um dublê controlável
// (mesmo padrão de `ServicoContaControlavel` em contaStore.test.ts) — cada teste resolve a
// chamada quando quiser, pra exercitar "um ciclo por vez", os gatilhos com timers falsos, e as
// transições de status sem depender de um servidor ou vault de verdade.

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../estado/vaultStore", () => ({
  useVaultStore: { subscribe: () => () => {} },
}));

const guardados: Record<string, unknown> = {};
/** Liga/desliga por teste — permite simular `salvarEstadoSync` lançando (disco cheio,
 * permissão), sem precisar mockar `sync/estadoSync.ts` inteiro. */
let salvarDeveFalhar = false;
vi.mock("@tauri-apps/plugin-store", () => ({
  load: async () => ({
    get: async (k: string) => guardados[k],
    set: async (k: string, v: unknown) => {
      guardados[k] = v;
    },
    clear: async () => {
      for (const k of Object.keys(guardados)) delete guardados[k];
    },
    save: async () => {
      if (salvarDeveFalhar) throw new Error("disco cheio");
    },
  }),
}));

import { useSyncStore, type DepsSyncStore, type CoordenacaoSync } from "./syncStore";
import { salvarEstadoSync, type EstadoSync } from "../sync/estadoSync";
import type { ContextoCiclo, ResultadoCiclo } from "../sync/motor";
import type { ServicoSync } from "../sync/ServicoSync";
import type { VaultAdapter, EntradaArquivo } from "../vault/VaultAdapter";
import type { EfeitosDeGravacao } from "../vault/efeitosDeGravacao";
import type { Conflito } from "../sync/tipos";

/** Dublê de `executarCiclo`: registra cada chamada e só resolve quando o teste mandar —
 * exatamente o ponto de controle que "um ciclo por vez" e os gatilhos com timer precisam. */
class ExecutorControlavel {
  chamadas: ContextoCiclo[] = [];
  private resolvers: Array<(r: ResultadoCiclo) => void> = [];

  executar = (ctx: ContextoCiclo): Promise<ResultadoCiclo> => {
    this.chamadas.push(ctx);
    return new Promise<ResultadoCiclo>((resolve) => {
      this.resolvers.push(resolve);
    });
  };

  /** Resolve a chamada mais antiga ainda pendente. */
  resolverProxima(resultado: ResultadoCiclo): void {
    const resolve = this.resolvers.shift();
    if (!resolve) throw new Error("nenhuma chamada de executarCiclo pendente para resolver");
    resolve(resultado);
  }
}

const OK: ResultadoCiclo = { ok: true, foraDaSincronizacao: [] };

/** Drena a fila de microtarefas — necessário depois de `resolverProxima` pra deixar as
 * continuações de `await` dentro de `rodarCiclo` (persistir, `set`, "rodar de novo") correrem
 * antes de o teste conferir o resultado. Timers falsos não afetam microtarefas/Promises
 * nativas, então isto não precisa (nem deve) avançar nenhum timer. */
async function drenar(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

function adaptadorFake(overrides: Partial<VaultAdapter> = {}): VaultAdapter {
  return {
    raiz: () => "C:/vault-teste",
    listar: async () => [] as EntradaArquivo[],
    lerTexto: async () => {
      throw new Error("ENOENT");
    },
    lerBinario: async () => new Uint8Array(),
    escreverTexto: async () => {},
    escreverBinario: async () => {},
    criarPasta: async () => {},
    mover: async () => {},
    remover: async () => {},
    listarPasta: async () => [],
    existe: async () => false,
    observar: () => () => {},
    aoPerderSincronia: () => () => {},
    ...overrides,
  };
}

function servicoFake(): ServicoSync {
  return {
    listarVaults: async () => [],
    criarVault: async () => {},
    baixar: async () => {
      throw new Error("não deveria ser chamado — executarCiclo é o dublê");
    },
    enviarLote: async () => {
      throw new Error("não deveria ser chamado — executarCiclo é o dublê");
    },
    enviarRetrato: async () => {},
    apagarVault: async () => {},
  };
}

function efeitosFake(): EfeitosDeGravacao {
  return {
    recarregarArvore: async () => {},
    reindexarArquivo: async () => {},
    cancelarAutosavePendente: () => {},
    recarregarDoDisco: async () => {},
    moverParaLixeira: async () => ({ ok: true }),
  };
}

function estadoBase(overrides: Partial<EstadoSync> = {}): EstadoSync {
  return {
    idDoVault: "vault-1",
    cursor: 0,
    bases: {},
    hashesConhecidos: {},
    conflitosPendentes: {},
    ...overrides,
  };
}

const RAIZ = "C:/vault-teste";

/** Dublê de `CoordenacaoSync` (plano 12 Task 3): concede a trava por padrão, com um `dono` novo
 * a cada concessão (não reentrante, como o Rust de verdade) — os testes de trava trocam
 * `concedida` ou leem `tentativas`/`liberacoes`/`donosConcedidos`/`donosLiberados`. */
class CoordenacaoControlavel implements CoordenacaoSync {
  concedida = true;
  tentativas: string[] = [];
  liberacoes: string[] = [];
  donosConcedidos: string[] = [];
  donosLiberados: string[] = [];
  private contador = 0;

  tentarTravarSync = async (caminho: string): Promise<string | null> => {
    this.tentativas.push(caminho);
    if (!this.concedida) return null;
    this.contador += 1;
    const dono = `dono-${this.contador}`;
    this.donosConcedidos.push(dono);
    return dono;
  };

  liberarTravaSync = async (caminho: string, dono: string): Promise<void> => {
    this.liberacoes.push(caminho);
    this.donosLiberados.push(dono);
  };
}

interface Montagem {
  deps: DepsSyncStore;
  exec: ExecutorControlavel;
  registrarConflitoMock: ReturnType<typeof vi.fn>;
  ouvintesIndice: Array<() => void>;
  coordenacao: CoordenacaoControlavel;
}

function montarDeps(overrides: Partial<DepsSyncStore> = {}): Montagem {
  const exec = new ExecutorControlavel();
  const registrarConflitoMock = vi.fn((_c: Conflito) => {});
  const ouvintesIndice: Array<() => void> = [];
  const coordenacao = new CoordenacaoControlavel();
  const deps: DepsSyncStore = {
    adaptador: adaptadorFake(),
    servico: servicoFake(),
    chaveDoVault: new Uint8Array(32),
    efeitos: efeitosFake(),
    nomeDesteComputador: "Notebook do Lucas (este computador)",
    registrarConflito: registrarConflitoMock,
    flushTudo: async () => ({ falhas: [], bloqueados: [] }),
    conflitosAbertos: () => new Set<string>(),
    assinarMudancasNoIndice: (ouvinte) => {
      ouvintesIndice.push(ouvinte);
      return () => {
        const i = ouvintesIndice.indexOf(ouvinte);
        if (i >= 0) ouvintesIndice.splice(i, 1);
      };
    },
    executarCiclo: exec.executar,
    coordenacao,
    ...overrides,
  };
  return { deps, exec, registrarConflitoMock, ouvintesIndice, coordenacao };
}

describe("syncStore", () => {
  beforeEach(() => {
    for (const k of Object.keys(guardados)) delete guardados[k];
    salvarDeveFalhar = false;
    useSyncStore.getState().parar();
    vi.useFakeTimers();
  });

  it("iniciar sem estado salvo fica desligado e não chama executarCiclo", async () => {
    const { deps, exec } = montarDeps();
    await useSyncStore.getState().iniciar(RAIZ, deps);
    expect(useSyncStore.getState().status).toBe("desligado");
    expect(exec.chamadas).toHaveLength(0);
  });

  it("iniciar com estado salvo dispara um ciclo já na hora (ao abrir o vault)", async () => {
    await salvarEstadoSync(RAIZ, estadoBase());
    const { deps, exec } = montarDeps();

    await useSyncStore.getState().iniciar(RAIZ, deps);

    expect(exec.chamadas).toHaveLength(1);
    expect(useSyncStore.getState().status).toBe("sincronizando");

    exec.resolverProxima(OK);
    await drenar();
    expect(useSyncStore.getState().status).toBe("sincronizado");
    expect(useSyncStore.getState().ultimoCiclo).not.toBeNull();
  });

  it("um ciclo por vez: pedido durante um ciclo em andamento gera exatamente mais um", async () => {
    await salvarEstadoSync(RAIZ, estadoBase());
    const { deps, exec } = montarDeps();
    await useSyncStore.getState().iniciar(RAIZ, deps); // 1ª chamada (ao iniciar), pendente

    expect(exec.chamadas).toHaveLength(1);

    // Três pedidos concorrentes enquanto o 1º ciclo ainda não terminou.
    void useSyncStore.getState().sincronizarAgora();
    void useSyncStore.getState().sincronizarAgora();
    void useSyncStore.getState().sincronizarAgora();
    await drenar();
    expect(exec.chamadas).toHaveLength(1); // nenhum rodou em paralelo

    exec.resolverProxima(OK); // termina o 1º
    await drenar();
    expect(exec.chamadas).toHaveLength(2); // só mais UM, não três

    exec.resolverProxima(OK); // termina o 2º
    await drenar();
    expect(exec.chamadas).toHaveLength(2); // nenhum terceiro rodou sozinho
    expect(useSyncStore.getState().status).toBe("sincronizado");
  });

  it("60 s depois do último ciclo dispara outro automaticamente", async () => {
    await salvarEstadoSync(RAIZ, estadoBase());
    const { deps, exec } = montarDeps();
    await useSyncStore.getState().iniciar(RAIZ, deps);
    exec.resolverProxima(OK);
    await drenar();
    expect(exec.chamadas).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(exec.chamadas).toHaveLength(2);

    exec.resolverProxima(OK);
    await drenar();
    expect(useSyncStore.getState().status).toBe("sincronizado");
  });

  it("mudança no índice dispara um ciclo 5 s depois; várias mudanças seguidas geram um só", async () => {
    await salvarEstadoSync(RAIZ, estadoBase());
    const { deps, exec, ouvintesIndice } = montarDeps();
    await useSyncStore.getState().iniciar(RAIZ, deps);
    exec.resolverProxima(OK); // termina o ciclo "ao iniciar"
    await drenar();
    expect(exec.chamadas).toHaveLength(1);

    // Várias mudanças seguidas, cada uma bem antes dos 5 s da anterior vencerem.
    ouvintesIndice.forEach((ouvir) => ouvir());
    await vi.advanceTimersByTimeAsync(2_000);
    ouvintesIndice.forEach((ouvir) => ouvir());
    await vi.advanceTimersByTimeAsync(2_000);
    ouvintesIndice.forEach((ouvir) => ouvir());
    await vi.advanceTimersByTimeAsync(4_000); // 4s depois da última — ainda não bateu 5s
    expect(exec.chamadas).toHaveLength(1); // nenhum ciclo novo ainda

    await vi.advanceTimersByTimeAsync(1_000); // agora bateu 5s da ÚLTIMA mudança
    expect(exec.chamadas).toHaveLength(2); // só UM ciclo novo, não três
  });

  it("erro de rede vira sem-conexao e se recupera no próximo ciclo bem-sucedido", async () => {
    await salvarEstadoSync(RAIZ, estadoBase());
    const { deps, exec } = montarDeps();
    await useSyncStore.getState().iniciar(RAIZ, deps);

    exec.resolverProxima({ ok: false, erro: "rede", foraDaSincronizacao: [] });
    await drenar();
    expect(useSyncStore.getState().status).toBe("sem-conexao");

    // Continua tentando sozinho: o próximo gatilho (60s) ainda dispara.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(exec.chamadas).toHaveLength(2);
    exec.resolverProxima(OK);
    await drenar();
    expect(useSyncStore.getState().status).toBe("sincronizado");
  });

  it("erro de plano para de agendar até sincronizarAgora() (algo mudou)", async () => {
    await salvarEstadoSync(RAIZ, estadoBase());
    const { deps, exec, ouvintesIndice } = montarDeps();
    await useSyncStore.getState().iniciar(RAIZ, deps);

    exec.resolverProxima({ ok: false, erro: "plano", foraDaSincronizacao: [] });
    await drenar();
    expect(useSyncStore.getState().status).toEqual({ erro: "plano" });

    // Os gatilhos automáticos ficam mudos.
    await vi.advanceTimersByTimeAsync(60_000);
    ouvintesIndice.forEach((ouvir) => ouvir());
    await vi.advanceTimersByTimeAsync(10_000);
    expect(exec.chamadas).toHaveLength(1); // nenhum novo desde o erro

    // sincronizarAgora() é o "algo mudou" que destrava.
    void useSyncStore.getState().sincronizarAgora();
    await drenar();
    expect(exec.chamadas).toHaveLength(2);
    exec.resolverProxima(OK);
    await drenar();
    expect(useSyncStore.getState().status).toBe("sincronizado");

    // E volta a agendar sozinho depois de destravar.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(exec.chamadas).toHaveLength(3);
  });

  it("uma exceção inesperada do executarCiclo vira { erro: servidor }, sem derrubar o app", async () => {
    await salvarEstadoSync(RAIZ, estadoBase());
    const { deps } = montarDeps({
      executarCiclo: async () => {
        throw new Error("falha de verdade, não um ResultadoCiclo");
      },
    });

    await useSyncStore.getState().iniciar(RAIZ, deps);
    await drenar();

    expect(useSyncStore.getState().status).toEqual({ erro: "servidor" });
  });

  it("persiste o EstadoSync depois de um ciclo com sucesso", async () => {
    await salvarEstadoSync(RAIZ, estadoBase());
    const chaveArquivo = Object.keys(guardados)[0]!;
    const { deps } = montarDeps({
      executarCiclo: async (ctx) => {
        ctx.estado.cursor = 7;
        return OK;
      },
    });

    await useSyncStore.getState().iniciar(RAIZ, deps);
    await drenar();

    const salvo = guardados[chaveArquivo] as { estado: EstadoSync };
    expect(salvo.estado.cursor).toBe(7);
  });

  it("persiste o EstadoSync mesmo quando o ciclo falha", async () => {
    await salvarEstadoSync(RAIZ, estadoBase());
    const chaveArquivo = Object.keys(guardados)[0]!;
    const { deps } = montarDeps({
      executarCiclo: async (ctx) => {
        ctx.estado.cursor = 3;
        return { ok: false, erro: "servidor", foraDaSincronizacao: ["grande.jpg"] };
      },
    });

    await useSyncStore.getState().iniciar(RAIZ, deps);
    await drenar();

    const salvo = guardados[chaveArquivo] as { estado: EstadoSync };
    expect(salvo.estado.cursor).toBe(3);
    expect(useSyncStore.getState().foraDaSincronizacao).toEqual(["grande.jpg"]);
  });

  it("re-registra conflitosPendentes ao iniciar, com a versão local lida do disco agora", async () => {
    await salvarEstadoSync(
      RAIZ,
      estadoBase({
        conflitosPendentes: {
          "nota.md": {
            hashRemoto: "abc",
            conteudo: "versão remota",
            dispositivo: "Desktop",
            criadoEm: "2026-01-01T00:00:00.000Z",
          },
        },
      }),
    );
    const { deps, exec, registrarConflitoMock } = montarDeps({
      adaptador: adaptadorFake({
        lerTexto: async (p) => {
          if (p === "nota.md") return "versão local agora";
          throw new Error("ENOENT");
        },
      }),
    });

    await useSyncStore.getState().iniciar(RAIZ, deps);
    exec.resolverProxima(OK);
    await drenar();

    expect(registrarConflitoMock).toHaveBeenCalledTimes(1);
    const conflito = registrarConflitoMock.mock.calls[0][0] as Conflito;
    expect(conflito.caminho).toBe("nota.md");
    expect(conflito.tipo).toBe("nota");
    expect(conflito.local.conteudo).toBe("versão local agora");
    expect(conflito.remoto.conteudo).toBe("versão remota");
    expect(conflito.remoto.dispositivo).toBe("Desktop");
  });

  it("conflito pendente cuja leitura local falha não é re-registrado, mas continua pendente", async () => {
    await salvarEstadoSync(
      RAIZ,
      estadoBase({
        conflitosPendentes: {
          "sumiu.md": {
            hashRemoto: "abc",
            conteudo: "versão remota",
            dispositivo: "Desktop",
            criadoEm: "2026-01-01T00:00:00.000Z",
          },
        },
      }),
    );
    const chaveArquivo = Object.keys(guardados)[0]!;
    const { deps, exec, registrarConflitoMock } = montarDeps(); // adaptador padrão: lerTexto sempre lança

    await useSyncStore.getState().iniciar(RAIZ, deps);
    exec.resolverProxima(OK);
    await drenar();

    expect(registrarConflitoMock).not.toHaveBeenCalled();
    const salvo = guardados[chaveArquivo] as { estado: EstadoSync };
    expect(salvo.estado.conflitosPendentes["sumiu.md"]).toBeDefined();
  });

  it("parar() cancela os gatilhos e ignora o resultado de um ciclo já em voo", async () => {
    await salvarEstadoSync(RAIZ, estadoBase());
    const { deps, exec, ouvintesIndice } = montarDeps();
    await useSyncStore.getState().iniciar(RAIZ, deps);
    expect(exec.chamadas).toHaveLength(1);

    useSyncStore.getState().parar();
    expect(useSyncStore.getState().status).toBe("desligado");
    expect(ouvintesIndice).toHaveLength(0); // assinatura cancelada

    // O ciclo que já estava em voo termina, mas não deve reviver o status nem persistir por
    // cima de um `iniciar()` seguinte.
    exec.resolverProxima(OK);
    await drenar();
    expect(useSyncStore.getState().status).toBe("desligado");

    await vi.advanceTimersByTimeAsync(60_000);
    expect(exec.chamadas).toHaveLength(1); // nenhum novo ciclo depois de parar
  });

  it("sincronizarAgora() sem iniciar() antes não faz nada", async () => {
    await useSyncStore.getState().sincronizarAgora();
    expect(useSyncStore.getState().status).toBe("desligado");
  });

  it("falha ao salvar o EstadoSync (disco cheio) vira { erro: servidor } e não trava o agendador", async () => {
    await salvarEstadoSync(RAIZ, estadoBase());
    const { deps, exec } = montarDeps();
    await useSyncStore.getState().iniciar(RAIZ, deps); // 1ª chamada, ainda pendente

    salvarDeveFalhar = true;
    exec.resolverProxima(OK); // o ciclo "deu certo", mas salvarEstadoSync vai lançar
    await drenar();

    expect(useSyncStore.getState().status).toEqual({ erro: "servidor" });

    // O agendador NÃO pode ter ficado preso em "cicloEmAndamento": o próximo gatilho
    // automático tem que disparar um ciclo de verdade, não só marcar `pedidoDeNovo` para
    // sempre.
    salvarDeveFalhar = false;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(exec.chamadas).toHaveLength(2);

    exec.resolverProxima(OK);
    await drenar();
    expect(useSyncStore.getState().status).toBe("sincronizado");
  });

  it("falha ao salvar o EstadoSync: sincronizarAgora() logo em seguida roda um ciclo de verdade, sem ficar preso", async () => {
    await salvarEstadoSync(RAIZ, estadoBase());
    const { deps, exec } = montarDeps();
    await useSyncStore.getState().iniciar(RAIZ, deps);

    salvarDeveFalhar = true;
    exec.resolverProxima(OK);
    await drenar();
    expect(useSyncStore.getState().status).toEqual({ erro: "servidor" });

    salvarDeveFalhar = false;
    void useSyncStore.getState().sincronizarAgora();
    await drenar();
    expect(exec.chamadas).toHaveLength(2); // rodou de verdade, não ficou só "pedido pendente"

    exec.resolverProxima(OK);
    await drenar();
    expect(useSyncStore.getState().status).toBe("sincronizado");
  });

  // `iniciarPendente` (plano 10 Task 5): `ligarAoVault.ts` chama isto quando `listarVaults()`
  // falha com `rede` ANTES de conseguir montar os `DepsSyncStore` (não tem adaptador nem
  // serviço prontos ainda) — sem isto, um vault já sincronizado neste computador, mas com o
  // app offline no boot, ficaria mostrando "não sincronizado" em vez de "sem conexão", porque
  // `raiz` nunca teria sido setado. Não agenda nada sozinho: quem tenta de novo é
  // `ligarAoVault.ts` (temporizador próprio dele), não o agendador deste store.
  it("iniciarPendente marca 'sem-conexao' e a raiz, sem chamar executarCiclo", () => {
    useSyncStore.getState().iniciarPendente(RAIZ);
    expect(useSyncStore.getState().status).toBe("sem-conexao");
    expect(useSyncStore.getState().raiz).toBe(RAIZ);
    expect(useSyncStore.getState().ultimoCiclo).toBeNull();
    expect(useSyncStore.getState().foraDaSincronizacao).toEqual([]);
  });

  it("iniciarPendente não deixa o store operante: sincronizarAgora() é no-op sem deps", async () => {
    useSyncStore.getState().iniciarPendente(RAIZ);
    await useSyncStore.getState().sincronizarAgora();
    // Continua "sem-conexao" — sincronizarAgora() não tinha deps pra rodar um ciclo de verdade.
    expect(useSyncStore.getState().status).toBe("sem-conexao");
  });

  it("parar() depois de iniciarPendente volta a 'desligado' e zera a raiz", () => {
    useSyncStore.getState().iniciarPendente(RAIZ);
    useSyncStore.getState().parar();
    expect(useSyncStore.getState().status).toBe("desligado");
    expect(useSyncStore.getState().raiz).toBeNull();
  });

  it("iniciar() de verdade depois de iniciarPendente substitui o estado pendente normalmente", async () => {
    await salvarEstadoSync(RAIZ, estadoBase());
    useSyncStore.getState().iniciarPendente(RAIZ);
    const { deps, exec } = montarDeps();

    await useSyncStore.getState().iniciar(RAIZ, deps);
    expect(exec.chamadas).toHaveLength(1);
    expect(useSyncStore.getState().status).toBe("sincronizando");

    exec.resolverProxima(OK);
    await drenar();
    expect(useSyncStore.getState().status).toBe("sincronizado");
  });

  // Trava de sincronização por vault (doc 17 §8.1, plano 12 Task 3, Review Focus 2): antes de
  // cada ciclo, `rodarCiclo` tenta travar `raiz` — outra janela (ou o segundo plano) já
  // sincronizando o mesmo vault não pode rodar em paralelo.
  describe("trava de sincronização (doc 17 §8.1)", () => {
    it("tenta travar antes de rodar e libera depois de um ciclo com sucesso", async () => {
      await salvarEstadoSync(RAIZ, estadoBase());
      const { deps, exec, coordenacao } = montarDeps();

      await useSyncStore.getState().iniciar(RAIZ, deps);
      expect(coordenacao.tentativas).toEqual([RAIZ]);
      expect(coordenacao.liberacoes).toEqual([]); // ainda em andamento

      exec.resolverProxima(OK);
      await drenar();
      expect(coordenacao.liberacoes).toEqual([RAIZ]);
    });

    it("libera com exatamente o dono devolvido por tentarTravarSync, nunca outro", async () => {
      await salvarEstadoSync(RAIZ, estadoBase());
      const { deps, exec, coordenacao } = montarDeps();

      await useSyncStore.getState().iniciar(RAIZ, deps);
      exec.resolverProxima(OK);
      await drenar();

      expect(coordenacao.donosConcedidos).toHaveLength(1);
      expect(coordenacao.donosLiberados).toEqual(coordenacao.donosConcedidos);
    });

    it("trava negada: o ciclo não roda (executarCiclo não é chamado), status fica inalterado, não é erro", async () => {
      await salvarEstadoSync(RAIZ, estadoBase());
      const { deps, exec, coordenacao } = montarDeps();
      coordenacao.concedida = false;

      await useSyncStore.getState().iniciar(RAIZ, deps);
      await drenar();

      expect(exec.chamadas).toHaveLength(0); // nunca chegou a rodar o ciclo
      expect(useSyncStore.getState().status).toBe("desligado"); // status do iniciar(), inalterado
      expect(coordenacao.liberacoes).toEqual([]); // nunca travou, nada para liberar
    });

    it("trava negada é refeita 2 s depois; concedendo na 2ª tentativa, o ciclo roda", async () => {
      await salvarEstadoSync(RAIZ, estadoBase());
      const { deps, exec, coordenacao } = montarDeps();
      coordenacao.concedida = false;

      await useSyncStore.getState().iniciar(RAIZ, deps);
      await drenar();
      expect(coordenacao.tentativas).toEqual([RAIZ]);
      expect(exec.chamadas).toHaveLength(0);

      coordenacao.concedida = true;
      await vi.advanceTimersByTimeAsync(2_000);
      await drenar();

      expect(coordenacao.tentativas).toEqual([RAIZ, RAIZ]);
      expect(exec.chamadas).toHaveLength(1); // agora rodou

      exec.resolverProxima(OK);
      await drenar();
      expect(useSyncStore.getState().status).toBe("sincronizado");
    });

    it("trava negada duas vezes seguidas não empilha duas novas tentativas", async () => {
      await salvarEstadoSync(RAIZ, estadoBase());
      const { deps, coordenacao } = montarDeps();
      coordenacao.concedida = false;

      await useSyncStore.getState().iniciar(RAIZ, deps);
      await drenar();
      expect(coordenacao.tentativas).toEqual([RAIZ]);

      // Um segundo gatilho (ex.: mudança no índice) enquanto já há uma nova tentativa agendada
      // não deve agendar outra — só uma tentativa de reagendamento por vez.
      void useSyncStore.getState().sincronizarAgora();
      await drenar();
      expect(coordenacao.tentativas).toEqual([RAIZ, RAIZ]); // a de sincronizarAgora rodou na hora

      await vi.advanceTimersByTimeAsync(2_000);
      await drenar();
      expect(coordenacao.tentativas).toEqual([RAIZ, RAIZ, RAIZ]); // só mais uma, não duas
    });

    it("trava é liberada mesmo quando o ciclo lança uma exceção inesperada", async () => {
      await salvarEstadoSync(RAIZ, estadoBase());
      const { deps, coordenacao } = montarDeps({
        executarCiclo: async () => {
          throw new Error("falha de verdade, não um ResultadoCiclo");
        },
      });

      await useSyncStore.getState().iniciar(RAIZ, deps);
      await drenar();

      expect(useSyncStore.getState().status).toEqual({ erro: "servidor" });
      expect(coordenacao.liberacoes).toEqual([RAIZ]); // liberada apesar da exceção
    });

    it("trava é liberada mesmo quando salvarEstadoSync falha", async () => {
      await salvarEstadoSync(RAIZ, estadoBase());
      const { deps, exec, coordenacao } = montarDeps();
      await useSyncStore.getState().iniciar(RAIZ, deps);

      salvarDeveFalhar = true;
      exec.resolverProxima(OK);
      await drenar();

      expect(coordenacao.liberacoes).toEqual([RAIZ]);
    });

    it("parar() cancela a nova tentativa agendada depois de uma trava negada", async () => {
      await salvarEstadoSync(RAIZ, estadoBase());
      const { deps, exec, coordenacao } = montarDeps();
      coordenacao.concedida = false;

      await useSyncStore.getState().iniciar(RAIZ, deps);
      await drenar();
      expect(coordenacao.tentativas).toEqual([RAIZ]);

      useSyncStore.getState().parar();
      coordenacao.concedida = true;
      await vi.advanceTimersByTimeAsync(2_000);
      await drenar();

      expect(coordenacao.tentativas).toEqual([RAIZ]); // nenhuma nova tentativa depois de parar
      expect(exec.chamadas).toHaveLength(0);
    });
  });
});
