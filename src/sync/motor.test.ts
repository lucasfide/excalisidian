// src/sync/motor.test.ts
// Testes de um computador só contra o servidor falso: AAD do lote pela sequência esperada,
// folga de tamanho (divisão recursiva quando `lacrar` recusaria), estado por cópia (falha no
// meio de um lote não avança o cursor), arquivo grande fica fora da sincronização, ciclo sem
// mudança nenhuma não envia nada, e o retrato automático (limiar injetável).
//
// Os cenários com dois/três computadores (criar/editar/conflito/renomear/concorrência/retrato
// pra computador novo) estão em motor.integracao.test.ts — aqui é só o comportamento do ciclo
// em si, isolado.

import { describe, it, expect, vi } from "vitest";

import {
  executarCiclo,
  iniciarVault,
  type ContextoCiclo,
} from "./motor";
import { abrir, aadDe } from "./pacote";
import { hashDe, TAMANHO_MAXIMO_SINCRONIZAVEL } from "./formato";
import { ServicoSyncFake } from "./ServicoSyncFake";
import { VaultAdapterMemoria } from "../vault/VaultAdapterMemoria";
import type { EstadoSync } from "./estadoSync";
import type { EfeitosDeGravacao } from "../vault/efeitosDeGravacao";
import type { VaultAdapter } from "../vault/VaultAdapter";

function efeitosFalsos() {
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
      return { ok: true } as const;
    }),
    chamadas,
  } satisfies EfeitosDeGravacao & { chamadas: string[] };
}

function estadoVazio(idDoVault = "vault-1"): EstadoSync {
  return { idDoVault, cursor: 0, bases: {}, hashesConhecidos: {}, conflitosPendentes: {} };
}

async function montarVaultComId(adaptador: VaultAdapter, servico: ServicoSyncFake) {
  const chaveDeEnvelope = new Uint8Array(32).fill(3);
  const { estado, chaveDoVault } = await iniciarVault({
    adaptador,
    servico,
    chaveDeEnvelope,
    nomeDoVault: "Vault de teste",
  });
  return { estado, chaveDoVault };
}

function ctxDe(overrides: Partial<ContextoCiclo> & Pick<ContextoCiclo, "adaptador" | "servico" | "chave" | "estado">): ContextoCiclo {
  return {
    nomeDesteComputador: "Computador de teste",
    efeitos: efeitosFalsos(),
    registrarConflito: () => {},
    flushTudo: async () => ({ falhas: [], bloqueados: [] }),
    conflitosAbertos: () => new Set(),
    ...overrides,
  };
}

describe("executarCiclo — sem mudança nenhuma", () => {
  it("vault vazio dos dois lados: não chama enviarLote, devolve ok sem foraDaSincronizacao", async () => {
    const servico = new ServicoSyncFake();
    const adaptador = new VaultAdapterMemoria();
    const { estado, chaveDoVault } = await montarVaultComId(adaptador, servico);
    const enviarLoteSpy = vi.spyOn(servico, "enviarLote");

    const resultado = await executarCiclo(ctxDe({ adaptador, servico, chave: chaveDoVault, estado }));

    expect(resultado).toEqual({ ok: true, foraDaSincronizacao: [] });
    expect(enviarLoteSpy).not.toHaveBeenCalled();
  });
});

describe("executarCiclo — AAD do lote pela sequência esperada", () => {
  it("o lote guardado no servidor abre com o AAD da sequência que o servidor de fato atribuiu", async () => {
    const servico = new ServicoSyncFake();
    const adaptador = new VaultAdapterMemoria();
    const { estado, chaveDoVault } = await montarVaultComId(adaptador, servico);
    await adaptador.escreverTexto("nota.md", "conteúdo");

    const resultado = await executarCiclo(ctxDe({ adaptador, servico, chave: chaveDoVault, estado }));
    expect(resultado.ok).toBe(true);
    expect(estado.cursor).toBe(1); // primeiro lote enviado por este computador

    const baixado = await servico.baixar(estado.idDoVault, 0);
    expect(baixado.lotes).toHaveLength(1);
    const { sequencia, bytes } = baixado.lotes[0];
    expect(sequencia).toBe(1);

    // Abre com o AAD da sequência de verdade — prova que foi isso que `lacrar` usou.
    await expect(abrir(chaveDoVault, bytes, aadDe(estado.idDoVault, "lote", sequencia))).resolves.toBeDefined();

    // Um AAD de sequência errada (a "esperada" de uma tentativa anterior, por exemplo) não abre.
    await expect(abrir(chaveDoVault, bytes, aadDe(estado.idDoVault, "lote", sequencia + 1))).rejects.toThrow();
  });
});

describe("executarCiclo — folga de tamanho", () => {
  it("bytes aleatórios perto de 7 MiB em vários arquivos: nenhum envio falha; lotes grandes são divididos", async () => {
    const servico = new ServicoSyncFake();
    const adaptador = new VaultAdapterMemoria();
    const { estado, chaveDoVault } = await montarVaultComId(adaptador, servico);

    // Incompressível de propósito (aleatório) — gzip não ajuda, então base64+gzip do lote
    // encosta nos 8 MiB e `lacrar` recusaria um lote com os três juntos.
    const tamanho = Math.floor(6.9 * 1024 * 1024);
    const PASSO = 65536; // limite do getRandomValues por chamada
    for (const nome of ["a.bin", "b.bin", "c.bin"]) {
      const bytes = new Uint8Array(tamanho);
      for (let i = 0; i < bytes.length; i += PASSO) {
        crypto.getRandomValues(bytes.subarray(i, Math.min(i + PASSO, bytes.length)));
      }
      await adaptador.escreverBinario(nome, bytes);
    }

    const resultado = await executarCiclo(ctxDe({ adaptador, servico, chave: chaveDoVault, estado }));

    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.foraDaSincronizacao).toEqual([]);

    const baixado = await servico.baixar(estado.idDoVault, 0);
    // Três arquivos de ~6.9 MiB não cabem juntos num pacote de 8 MiB — teve que dividir em
    // mais de um lote.
    expect(baixado.lotes.length).toBeGreaterThan(1);

    // Todos os pacotes abrem com o AAD certo (prova que cada um foi lacrado com sucesso).
    for (const { sequencia, bytes } of baixado.lotes) {
      await expect(
        abrir(chaveDoVault, bytes, aadDe(estado.idDoVault, "lote", sequencia)),
      ).resolves.toBeDefined();
    }

    expect(estado.bases["a.bin"]).toBeDefined();
    expect(estado.bases["b.bin"]).toBeDefined();
    expect(estado.bases["c.bin"]).toBeDefined();
  }, 30000);

  it("uma mudança só que não cabe nem sozinha: o arquivo fica fora da sincronização", async () => {
    // `dividirEmLotes` já lança se uma mudança sozinha passar de TAMANHO_MAXIMO_SINCRONIZAVEL
    // (7 MiB) — não chega a ser candidata a lote. Este teste cobre isso indiretamente: um
    // arquivo maior que o limite nunca é sequer lido pro envio (fica de fora já na detecção).
    const servico = new ServicoSyncFake();
    const adaptador = new VaultAdapterMemoria();
    const { estado, chaveDoVault } = await montarVaultComId(adaptador, servico);

    const grande = new Uint8Array(TAMANHO_MAXIMO_SINCRONIZAVEL + 1024);
    await adaptador.escreverBinario("gigante.bin", grande);
    await adaptador.escreverTexto("normal.md", "nota comum");

    const resultado = await executarCiclo(ctxDe({ adaptador, servico, chave: chaveDoVault, estado }));

    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.foraDaSincronizacao).toEqual(["gigante.bin"]);
    expect(estado.bases["gigante.bin"]).toBeUndefined();
    expect(estado.bases["normal.md"]).toBeDefined();
  });
});

describe("executarCiclo — estado por cópia (falha no meio de um lote)", () => {
  /** Envolve um VaultAdapterMemoria real, cujas escritas de texto/binário falham a partir da
   * N-ésima chamada (contando as duas juntas) — simula uma falha no meio da aplicação de um
   * lote com várias mudanças "gravar". */
  function adaptadorQueFalhaNaEscritaDeNumero(base: VaultAdapterMemoria, falharNaEscrita: number): VaultAdapter {
    let contador = 0;
    function talvezFalhar() {
      contador += 1;
      if (contador === falharNaEscrita) throw new Error("disco cheio (simulado)");
    }
    return {
      raiz: () => base.raiz(),
      listar: () => base.listar(),
      lerTexto: (p: string) => base.lerTexto(p),
      lerBinario: (p: string) => base.lerBinario(p),
      escreverTexto: async (p: string, c: string) => {
        talvezFalhar();
        return base.escreverTexto(p, c);
      },
      escreverBinario: async (p: string, d: Uint8Array) => {
        talvezFalhar();
        return base.escreverBinario(p, d);
      },
      criarPasta: (p: string) => base.criarPasta(p),
      mover: (de: string, para: string) => base.mover(de, para),
      remover: (p: string) => base.remover(p),
      listarPasta: (p: string) => base.listarPasta(p),
      existe: (p: string) => base.existe(p),
      observar: (cb) => base.observar(cb),
      aoPerderSincronia: (cb) => base.aoPerderSincronia(cb),
    };
  }

  it("falha na 3ª mudança de um lote: cursor não avança; ciclo seguinte (sem falha) fica idêntico a nunca ter falhado", async () => {
    const servico = new ServicoSyncFake();

    // Computador A envia um lote com 4 arquivos novos.
    const adaptadorA = new VaultAdapterMemoria();
    const { estado: estadoA, chaveDoVault } = await montarVaultComId(adaptadorA, servico);
    for (const nome of ["1.md", "2.md", "3.md", "4.md"]) {
      await adaptadorA.escreverTexto(nome, `conteúdo de ${nome}`);
    }
    const envioA = await executarCiclo(ctxDe({ adaptador: adaptadorA, servico, chave: chaveDoVault, estado: estadoA }));
    expect(envioA.ok).toBe(true);

    // Computador B baixa esse lote, mas a 3ª escrita falha.
    const baseB = new VaultAdapterMemoria();
    const adaptadorBQuebrado = adaptadorQueFalhaNaEscritaDeNumero(baseB, 3);
    const estadoB = estadoVazio(estadoA.idDoVault);
    const resultado1 = await executarCiclo(
      ctxDe({ adaptador: adaptadorBQuebrado, servico, chave: chaveDoVault, estado: estadoB }),
    );

    expect(resultado1).toEqual({ ok: false, erro: "aplicar-lote", foraDaSincronizacao: [] });
    expect(estadoB.cursor).toBe(0); // não avançou
    expect(Object.keys(estadoB.bases)).toEqual([]); // nada foi adotado
    // As duas primeiras escritas já tinham ido para o disco antes da 3ª falhar — o "estado
    // por cópia" é sobre `EstadoSync`, não sobre o disco (aplicarLote já documenta isso).
    expect(await baseB.existe("1.md")).toBe(true);
    expect(await baseB.existe("2.md")).toBe(true);
    expect(await baseB.existe("3.md")).toBe(false);
    expect(await baseB.existe("4.md")).toBe(false);

    // Ciclo seguinte, sem a falha: reaplica o MESMO lote (cursor ainda em 0) sobre o disco já
    // parcialmente escrito — a tabela do doc 17 §6 cobre isso ("gravar | já igual | só bases").
    const resultado2 = await executarCiclo(
      ctxDe({ adaptador: baseB, servico, chave: chaveDoVault, estado: estadoB }),
    );
    expect(resultado2).toEqual({ ok: true, foraDaSincronizacao: [] });
    expect(estadoB.cursor).toBe(1);

    for (const nome of ["1.md", "2.md", "3.md", "4.md"]) {
      expect(await baseB.lerTexto(nome)).toBe(`conteúdo de ${nome}`);
      expect(estadoB.bases[nome]).toBe(estadoA.bases[nome]);
    }

    // Resultado idêntico ao de um B que nunca teve a falha: mesmas bases, mesmo cursor.
    const baseControle = new VaultAdapterMemoria();
    const estadoControle = estadoVazio(estadoA.idDoVault);
    await executarCiclo(ctxDe({ adaptador: baseControle, servico, chave: chaveDoVault, estado: estadoControle }));
    expect(estadoB.bases).toEqual(estadoControle.bases);
    expect(estadoB.cursor).toBe(estadoControle.cursor);
  });
});

describe("executarCiclo — falhas do servidor", () => {
  it("rede: devolve { ok:false, erro:'rede' } sem lançar", async () => {
    const servico = new ServicoSyncFake();
    const adaptador = new VaultAdapterMemoria();
    const { estado, chaveDoVault } = await montarVaultComId(adaptador, servico);
    servico.simularFalha("rede");

    const resultado = await executarCiclo(ctxDe({ adaptador, servico, chave: chaveDoVault, estado }));
    expect(resultado).toEqual({ ok: false, erro: "rede", foraDaSincronizacao: [] });
  });

  it("espaço ao enviar: devolve { ok:false, erro:'espaco' }, cursor de baixar já tinha avançado", async () => {
    const servico = new ServicoSyncFake();
    const adaptador = new VaultAdapterMemoria();
    const { estado, chaveDoVault } = await montarVaultComId(adaptador, servico);
    await adaptador.escreverTexto("nota.md", "x");

    servico.simularFalha("espaco");
    const resultado = await executarCiclo(ctxDe({ adaptador, servico, chave: chaveDoVault, estado }));

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.erro).toBe("espaco");
    expect(estado.bases["nota.md"]).toBeUndefined(); // não foi dado como sincronizado
  });
});

describe("executarCiclo — retrato automático", () => {
  it("cursor além do limiar injetado: manda enviarRetrato depois de enviar", async () => {
    const servico = new ServicoSyncFake();
    const adaptador = new VaultAdapterMemoria();
    const { estado, chaveDoVault } = await montarVaultComId(adaptador, servico);
    await adaptador.escreverTexto("nota.md", "conteúdo");

    const enviarRetratoSpy = vi.spyOn(servico, "enviarRetrato");

    const resultado = await executarCiclo(
      ctxDe({
        adaptador,
        servico,
        chave: chaveDoVault,
        estado,
        limiarRetrato: { lotes: 1, bytesBrutos: Number.POSITIVE_INFINITY },
      }),
    );

    expect(resultado.ok).toBe(true);
    expect(enviarRetratoSpy).toHaveBeenCalledTimes(1);
    const [idChamado, ateSequenciaChamado] = enviarRetratoSpy.mock.calls[0];
    expect(idChamado).toBe(estado.idDoVault);
    expect(ateSequenciaChamado).toBe(estado.cursor);
  });

  it("cursor abaixo do limiar: não manda retrato", async () => {
    const servico = new ServicoSyncFake();
    const adaptador = new VaultAdapterMemoria();
    const { estado, chaveDoVault } = await montarVaultComId(adaptador, servico);
    await adaptador.escreverTexto("nota.md", "conteúdo");

    const enviarRetratoSpy = vi.spyOn(servico, "enviarRetrato");

    await executarCiclo(
      ctxDe({
        adaptador,
        servico,
        chave: chaveDoVault,
        estado,
        limiarRetrato: { lotes: 1000, bytesBrutos: Number.POSITIVE_INFINITY },
      }),
    );

    expect(enviarRetratoSpy).not.toHaveBeenCalled();
  });
});

describe("iniciarVault", () => {
  it("cria o vault no servidor e envia o conteúdo existente como o primeiro lote", async () => {
    const servico = new ServicoSyncFake();
    const adaptador = new VaultAdapterMemoria();
    await adaptador.escreverTexto("nota.md", "já existia antes de ligar a sincronização");
    const chaveDeEnvelope = new Uint8Array(32).fill(5);

    const { estado, chaveDoVault, foraDaSincronizacao } = await iniciarVault({
      adaptador,
      servico,
      chaveDeEnvelope,
      nomeDoVault: "Meu vault",
    });

    expect(foraDaSincronizacao).toEqual([]);
    expect(estado.cursor).toBe(1);
    const hashEsperado = await hashDe(new TextEncoder().encode("já existia antes de ligar a sincronização"));
    expect(estado.bases["nota.md"]).toBe(hashEsperado);

    const vaults = await servico.listarVaults();
    expect(vaults).toHaveLength(1);
    expect(vaults[0].id).toBe(estado.idDoVault);

    // O nome cifrado abre com a própria chaveDoVault (não é a chaveDeEnvelope).
    await expect(
      abrir(chaveDoVault, vaults[0].nomeCifrado, aadDe(estado.idDoVault, "nome")),
    ).resolves.toEqual(new TextEncoder().encode("Meu vault"));
  });

  it("vault vazio: não envia lote nenhum, cursor fica em 0", async () => {
    const servico = new ServicoSyncFake();
    const adaptador = new VaultAdapterMemoria();
    const chaveDeEnvelope = new Uint8Array(32).fill(5);
    const enviarLoteSpy = vi.spyOn(servico, "enviarLote");

    const { estado } = await iniciarVault({ adaptador, servico, chaveDeEnvelope, nomeDoVault: "Vazio" });

    expect(estado.cursor).toBe(0);
    expect(enviarLoteSpy).not.toHaveBeenCalled();
  });

  it("id repetido (corrida improvável, mas o contrato define o comportamento): propaga o erro do servidor", async () => {
    const servico = new ServicoSyncFake();
    const adaptador = new VaultAdapterMemoria();
    const chaveDeEnvelope = new Uint8Array(32).fill(5);

    // Simula colisão de id forçando o servidor a recusar todo criarVault.
    servico.simularFalha("plano");
    await expect(
      iniciarVault({ adaptador, servico, chaveDeEnvelope, nomeDoVault: "X" }),
    ).rejects.toThrow(expect.objectContaining({ codigo: "plano" }));
  });
});
