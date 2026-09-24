// src/sync/aplicar.test.ts
// Um teste por linha da tabela do doc 17 §6 ("Aplicar uma mudança que veio de fora"), mais os
// casos extras pedidos na Task 3 do plano 09: pasta nova, os dois cuidados da revisão do
// plano 08 (`so-atualizar-base` vindo de `apagar` remove de `bases`; `mover-para-lixeira` de
// arquivo já ausente não toca o disco), conflito de texto (fila da tela + `conflitosPendentes`,
// tipo nota/desenho), binário em conflito ("manter as duas" sem sobrescrever outra cópia),
// pasta ponto ignorada, hash de UTF-8 batendo com o disco, e `flushTudo` antes de ler hashes.

import { describe, it, expect, vi } from "vitest";

import { aplicarLote, type ContextoAplicar } from "./aplicar";
import { hashDe, type Lote, type Mudanca } from "./formato";
import type { EstadoSync } from "./estadoSync";
import type { Conflito } from "./tipos";
import type { EfeitosDeGravacao } from "../vault/efeitosDeGravacao";
import { VaultAdapterMemoria } from "../vault/VaultAdapterMemoria";
import type { VaultAdapter } from "../vault/VaultAdapter";

/** Envolve um `VaultAdapterMemoria` real, delegando tudo, exceto `lerTexto` do caminho dado,
 * que lança — simula uma falha de leitura (permissão, corrupção) só na leitura de texto,
 * independente de `lerBinario` (usado por `hashLocalDe`) continuar funcionando normalmente. */
function adaptadorComLerTextoQuebrado(base: VaultAdapterMemoria, caminhoQuebrado: string): VaultAdapter {
  return {
    raiz: () => base.raiz(),
    listar: () => base.listar(),
    lerTexto: async (path: string) => {
      if (path === caminhoQuebrado) throw new Error("falha ao ler o arquivo local");
      return base.lerTexto(path);
    },
    lerBinario: (path: string) => base.lerBinario(path),
    escreverTexto: (path: string, conteudo: string) => base.escreverTexto(path, conteudo),
    escreverBinario: (path: string, dados: Uint8Array) => base.escreverBinario(path, dados),
    criarPasta: (path: string) => base.criarPasta(path),
    mover: (de: string, para: string) => base.mover(de, para),
    remover: (path: string) => base.remover(path),
    listarPasta: (path: string) => base.listarPasta(path),
    existe: (path: string) => base.existe(path),
    observar: (cb) => base.observar(cb),
    aoPerderSincronia: (cb) => base.aoPerderSincronia(cb),
  };
}

const encoder = new TextEncoder();

function estadoVazio(): EstadoSync {
  return {
    idDoVault: "vault-1",
    cursor: 0,
    bases: {},
    hashesConhecidos: {},
    conflitosPendentes: {},
  };
}

function efeitosFalsos() {
  const chamadas: string[] = [];
  const recarregarArvore = vi.fn(async () => {
    chamadas.push("recarregarArvore");
  });
  const reindexarArquivo = vi.fn(async (caminho: string) => {
    chamadas.push(`reindexarArquivo:${caminho}`);
  });
  const cancelarAutosavePendente = vi.fn((caminho: string) => {
    chamadas.push(`cancelarAutosavePendente:${caminho}`);
  });
  const recarregarDoDisco = vi.fn(async (caminho: string) => {
    chamadas.push(`recarregarDoDisco:${caminho}`);
  });
  const moverParaLixeira = vi.fn(async (caminho: string) => {
    chamadas.push(`moverParaLixeira:${caminho}`);
    return { ok: true } as const;
  });
  return {
    recarregarArvore,
    reindexarArquivo,
    cancelarAutosavePendente,
    recarregarDoDisco,
    moverParaLixeira,
    chamadas,
  } satisfies EfeitosDeGravacao & { chamadas: string[] };
}

function loteDe(mudancas: Mudanca[], overrides: Partial<Lote> = {}): Lote {
  return {
    versao: 1,
    dispositivo: "Notebook do Lucas",
    criadoEm: "2026-09-24T12:00:00.000Z",
    mudancas,
    ...overrides,
  };
}

function contexto(
  adaptador: VaultAdapter,
  estado: EstadoSync,
): ContextoAplicar & {
  efeitos: EfeitosDeGravacao & { chamadas: string[] };
  conflitosRegistrados: Conflito[];
  flushTudoMock: ReturnType<typeof vi.fn>;
} {
  const conflitosRegistrados: Conflito[] = [];
  const flushTudoMock = vi.fn(async () => ({ falhas: [], bloqueados: [] }));
  return {
    adaptador,
    efeitos: efeitosFalsos(),
    estado,
    nomeDesteComputador: "Este computador",
    registrarConflito: (c) => conflitosRegistrados.push(c),
    flushTudo: flushTudoMock,
    conflitosRegistrados,
    flushTudoMock,
  };
}

describe("aplicarLote — tabela do doc 17 §6", () => {
  it("gravar | local == base (não mexi) | grava o remoto; bases = hash", async () => {
    const adaptador = new VaultAdapterMemoria();
    await adaptador.escreverTexto("nota.md", "conteúdo antigo");
    const hashAntigo = await hashDe(encoder.encode("conteúdo antigo"));
    const estado = estadoVazio();
    estado.bases["nota.md"] = hashAntigo;

    const conteudoNovo = encoder.encode("conteúdo novo");
    const hashNovo = await hashDe(conteudoNovo);
    const ctx = contexto(adaptador, estado);

    await aplicarLote(ctx, loteDe([
      { tipo: "gravar", caminho: "nota.md", base: hashAntigo, hash: hashNovo, conteudo: conteudoNovo },
    ]));

    expect(await adaptador.lerTexto("nota.md")).toBe("conteúdo novo");
    expect(estado.bases["nota.md"]).toBe(hashNovo);
    expect(ctx.efeitos.chamadas).toEqual([
      "cancelarAutosavePendente:nota.md",
      "recarregarArvore",
      "reindexarArquivo:nota.md",
      "recarregarDoDisco:nota.md",
    ]);
  });

  it("gravar | arquivo não existe aqui | grava o remoto; bases = hash", async () => {
    const adaptador = new VaultAdapterMemoria();
    const estado = estadoVazio();
    const conteudo = encoder.encode("nova nota");
    const hash = await hashDe(conteudo);
    const ctx = contexto(adaptador, estado);

    await aplicarLote(ctx, loteDe([
      { tipo: "gravar", caminho: "nova.md", base: null, hash, conteudo },
    ]));

    expect(await adaptador.lerTexto("nova.md")).toBe("nova nota");
    expect(estado.bases["nova.md"]).toBe(hash);
  });

  it("gravar | local == hash (já igual) | só bases = hash", async () => {
    const adaptador = new VaultAdapterMemoria();
    await adaptador.escreverTexto("nota.md", "mesmo conteúdo");
    const hash = await hashDe(encoder.encode("mesmo conteúdo"));
    const estado = estadoVazio();
    estado.bases["nota.md"] = "hash-base-qualquer";
    const ctx = contexto(adaptador, estado);

    await aplicarLote(ctx, loteDe([
      { tipo: "gravar", caminho: "nota.md", base: "hash-base-qualquer", hash, conteudo: encoder.encode("mesmo conteúdo") },
    ]));

    expect(estado.bases["nota.md"]).toBe(hash);
    expect(ctx.efeitos.chamadas).toEqual([]); // não regrava
  });

  it("gravar | mexi (local != base) | conflito: registra na conflitosStore, nada é gravado", async () => {
    const adaptador = new VaultAdapterMemoria();
    await adaptador.escreverTexto("nota.md", "versão editada aqui");
    const estado = estadoVazio();
    estado.bases["nota.md"] = "hash-base";
    const ctx = contexto(adaptador, estado);

    const conteudoRemoto = encoder.encode("versão remota");
    const hashRemoto = await hashDe(conteudoRemoto);

    await aplicarLote(ctx, loteDe([
      { tipo: "gravar", caminho: "nota.md", base: "hash-base", hash: hashRemoto, conteudo: conteudoRemoto },
    ]));

    expect(await adaptador.lerTexto("nota.md")).toBe("versão editada aqui"); // nada gravado
    expect(ctx.efeitos.chamadas).toEqual([]);
    expect(estado.bases["nota.md"]).toBe("hash-base"); // base não muda até resolver
  });

  it("apagar | local == base | move para a lixeira deste computador", async () => {
    const adaptador = new VaultAdapterMemoria();
    await adaptador.escreverTexto("nota.md", "conteúdo");
    const hash = await hashDe(encoder.encode("conteúdo"));
    const estado = estadoVazio();
    estado.bases["nota.md"] = hash;
    const ctx = contexto(adaptador, estado);

    await aplicarLote(ctx, loteDe([{ tipo: "apagar", caminho: "nota.md", base: hash }]));

    expect(ctx.efeitos.moverParaLixeira).toHaveBeenCalledWith("nota.md");
    expect(estado.bases["nota.md"]).toBeUndefined();
  });

  it("apagar | mexi | não apaga: a versão local será enviada de novo no passo 3", async () => {
    const adaptador = new VaultAdapterMemoria();
    await adaptador.escreverTexto("nota.md", "editei aqui");
    const estado = estadoVazio();
    estado.bases["nota.md"] = "hash-base";
    const ctx = contexto(adaptador, estado);

    await aplicarLote(ctx, loteDe([{ tipo: "apagar", caminho: "nota.md", base: "hash-base" }]));

    expect(await adaptador.lerTexto("nota.md")).toBe("editei aqui");
    expect(ctx.efeitos.moverParaLixeira).not.toHaveBeenCalled();
    expect(estado.bases["nota.md"]).toBe("hash-base"); // não muda: reenviada como está
  });

  it("gravar de arquivo que apaguei aqui | recria o arquivo com a versão remota (apagar nunca vence editar)", async () => {
    const adaptador = new VaultAdapterMemoria();
    const estado = estadoVazio();
    estado.bases["nota.md"] = "hash-base"; // eu tinha isto sincronizado e apaguei
    const ctx = contexto(adaptador, estado);

    const conteudoRemoto = encoder.encode("recriada de fora");
    const hashRemoto = await hashDe(conteudoRemoto);

    await aplicarLote(ctx, loteDe([
      { tipo: "gravar", caminho: "nota.md", base: "hash-base", hash: hashRemoto, conteudo: conteudoRemoto },
    ]));

    expect(await adaptador.lerTexto("nota.md")).toBe("recriada de fora");
    expect(estado.bases["nota.md"]).toBe(hashRemoto);
  });
});

describe("aplicarLote — pasta nova", () => {
  it("nota remota numa pasta que não existe aqui é gravada (a pasta é criada antes)", async () => {
    const adaptador = new VaultAdapterMemoria();
    const estado = estadoVazio();
    const ctx = contexto(adaptador, estado);
    const conteudo = encoder.encode("conteúdo em pasta nova");
    const hash = await hashDe(conteudo);

    await aplicarLote(ctx, loteDe([
      { tipo: "gravar", caminho: "a/b/c.md", base: null, hash, conteudo },
    ]));

    expect(await adaptador.lerTexto("a/b/c.md")).toBe("conteúdo em pasta nova");
    expect(estado.bases["a/b/c.md"]).toBe(hash);
  });
});

describe("aplicarLote — cuidados da revisão do plano 08", () => {
  it("so-atualizar-base vindo de apagar REMOVE o caminho de bases (convergência)", async () => {
    const adaptador = new VaultAdapterMemoria();
    const estado = estadoVazio();
    estado.bases["nota.md"] = "hash-base"; // eu também já apaguei
    const ctx = contexto(adaptador, estado);

    await aplicarLote(ctx, loteDe([{ tipo: "apagar", caminho: "nota.md", base: "hash-base" }]));

    expect(Object.prototype.hasOwnProperty.call(estado.bases, "nota.md")).toBe(false);
    expect(ctx.efeitos.moverParaLixeira).not.toHaveBeenCalled();
  });

  it("mover-para-lixeira de arquivo que não existe aqui não toca o disco e limpa bases", async () => {
    const adaptador = new VaultAdapterMemoria();
    const estado = estadoVazio(); // local === null e base === null (nunca existiu aqui)
    const ctx = contexto(adaptador, estado);

    await aplicarLote(ctx, loteDe([{ tipo: "apagar", caminho: "fantasma.md", base: "hash-x" }]));

    expect(ctx.efeitos.moverParaLixeira).not.toHaveBeenCalled();
    expect(await adaptador.existe("fantasma.md")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(estado.bases, "fantasma.md")).toBe(false);
  });
});

describe("aplicarLote — conflito de texto", () => {
  it("vai para estado.conflitosPendentes (com hashRemoto/conteudo/dispositivo/criadoEm) e para a fila da tela, tipo nota", async () => {
    const adaptador = new VaultAdapterMemoria();
    await adaptador.escreverTexto("nota.md", "local editado");
    const estado = estadoVazio();
    estado.bases["nota.md"] = "hash-base";
    const ctx = contexto(adaptador, estado);

    const conteudoRemoto = encoder.encode("remoto editado");
    const hashRemoto = await hashDe(conteudoRemoto);

    await aplicarLote(ctx, loteDe([
      { tipo: "gravar", caminho: "nota.md", base: "hash-base", hash: hashRemoto, conteudo: conteudoRemoto },
    ], { dispositivo: "Notebook do Lucas", criadoEm: "2026-09-24T12:00:00.000Z" }));

    expect(estado.conflitosPendentes["nota.md"]).toEqual({
      hashRemoto,
      conteudo: "remoto editado",
      dispositivo: "Notebook do Lucas",
      criadoEm: "2026-09-24T12:00:00.000Z",
    });
    expect(ctx.conflitosRegistrados).toHaveLength(1);
    expect(ctx.conflitosRegistrados[0]).toMatchObject({
      caminho: "nota.md",
      tipo: "nota",
      local: { origem: "local", conteudo: "local editado" },
      remoto: { origem: "remoto", conteudo: "remoto editado", dispositivo: "Notebook do Lucas" },
    });
  });

  it("caminho .draw.md em conflito registra tipo 'desenho'", async () => {
    const adaptador = new VaultAdapterMemoria();
    await adaptador.escreverTexto("mapa.draw.md", "cena local");
    const estado = estadoVazio();
    estado.bases["mapa.draw.md"] = "hash-base";
    const ctx = contexto(adaptador, estado);

    const conteudoRemoto = encoder.encode("cena remota");
    const hashRemoto = await hashDe(conteudoRemoto);

    await aplicarLote(ctx, loteDe([
      { tipo: "gravar", caminho: "mapa.draw.md", base: "hash-base", hash: hashRemoto, conteudo: conteudoRemoto },
    ]));

    expect(ctx.conflitosRegistrados[0].tipo).toBe("desenho");
  });
});

describe("aplicarLote — falha ao ler a versão local durante um conflito", () => {
  it("lerTexto falhando no caminho em conflito faz aplicarLote rejeitar; nada é gravado nem registrado", async () => {
    const base = new VaultAdapterMemoria();
    await base.escreverTexto("nota.md", "local editado");
    const adaptador = adaptadorComLerTextoQuebrado(base, "nota.md");
    const estado = estadoVazio();
    estado.bases["nota.md"] = "hash-base";
    const ctx = contexto(adaptador, estado);

    const conteudoRemoto = encoder.encode("remoto editado");
    const hashRemoto = await hashDe(conteudoRemoto);

    await expect(
      aplicarLote(
        ctx,
        loteDe([
          { tipo: "gravar", caminho: "nota.md", base: "hash-base", hash: hashRemoto, conteudo: conteudoRemoto },
        ]),
      ),
    ).rejects.toThrow();

    // Nada do conflito foi registrado — nem na fila da tela, nem em conflitosPendentes.
    expect(estado.conflitosPendentes["nota.md"]).toBeUndefined();
    expect(ctx.conflitosRegistrados).toHaveLength(0);
    // O disco não foi tocado: continua com o conteúdo local de antes.
    expect(await base.lerTexto("nota.md")).toBe("local editado");
    expect(ctx.efeitos.chamadas).toEqual([]);
    // bases não muda: a próxima tentativa (próximo ciclo) vê o mesmo estado de antes.
    expect(estado.bases["nota.md"]).toBe("hash-base");
  });
});

describe("aplicarLote — binário em conflito", () => {
  it('gera a cópia com o nome de conflito (nunca sobrescreve outra cópia) e bases[original] = hashRemoto', async () => {
    const adaptador = new VaultAdapterMemoria();
    const localBytes = new Uint8Array([1, 1, 1]);
    await adaptador.escreverBinario("foto.png", localBytes);
    const estado = estadoVazio();
    estado.bases["foto.png"] = "hash-base";
    const ctx = contexto(adaptador, estado);

    const remotoBytes = new Uint8Array([2, 2, 2]);
    const hashRemoto = await hashDe(remotoBytes);

    await aplicarLote(ctx, loteDe([
      { tipo: "gravar", caminho: "foto.png", base: "hash-base", hash: hashRemoto, conteudo: remotoBytes },
    ], { dispositivo: "Notebook do Lucas", criadoEm: "2026-09-24T12:00:00.000Z" }));

    // A local não é tocada.
    expect(await adaptador.lerBinario("foto.png")).toEqual(localBytes);
    // bases aponta pro hash remoto — próximo ciclo reenvia a local por cima.
    expect(estado.bases["foto.png"]).toBe(hashRemoto);

    const nomeEsperado = "foto (conflito de 24-09-2026, Notebook do Lucas).png";
    expect(await adaptador.existe(nomeEsperado)).toBe(true);
    expect(await adaptador.lerBinario(nomeEsperado)).toEqual(remotoBytes);

    // Uma segunda rodada de conflito no mesmo caminho/dispositivo/dia não apaga a primeira cópia.
    const remotoBytes2 = new Uint8Array([3, 3, 3]);
    const hashRemoto2 = await hashDe(remotoBytes2);
    await adaptador.escreverBinario("foto.png", localBytes); // local segue "mexida"
    estado.bases["foto.png"] = "hash-base-2";
    await aplicarLote(ctx, loteDe([
      { tipo: "gravar", caminho: "foto.png", base: "hash-base-2", hash: hashRemoto2, conteudo: remotoBytes2 },
    ], { dispositivo: "Notebook do Lucas", criadoEm: "2026-09-24T12:00:00.000Z" }));

    expect(await adaptador.lerBinario(nomeEsperado)).toEqual(remotoBytes); // primeira cópia intacta
    const nomeSegunda = "foto (conflito de 24-09-2026, Notebook do Lucas) (2).png";
    expect(await adaptador.existe(nomeSegunda)).toBe(true);
    expect(await adaptador.lerBinario(nomeSegunda)).toEqual(remotoBytes2);
  });
});

describe("aplicarLote — pasta ponto", () => {
  it("caminho em pasta ponto é ignorado: nenhum disco, nenhum estado tocado", async () => {
    const adaptador = new VaultAdapterMemoria();
    const estado = estadoVazio();
    const ctx = contexto(adaptador, estado);
    const conteudo = encoder.encode("config");
    const hash = await hashDe(conteudo);

    await aplicarLote(ctx, loteDe([
      { tipo: "gravar", caminho: ".excalisidian/config.json", base: null, hash, conteudo },
    ]));

    expect(await adaptador.existe(".excalisidian/config.json")).toBe(false);
    expect(estado.bases[".excalisidian/config.json"]).toBeUndefined();
    expect(ctx.efeitos.chamadas).toEqual([]);
  });
});

describe("aplicarLote — hash do disco depois de gravar texto com acentos", () => {
  it("o hash do que fica no disco é o mesmo hash da mudança, lido como bytes", async () => {
    const adaptador = new VaultAdapterMemoria();
    const estado = estadoVazio();
    const ctx = contexto(adaptador, estado);
    const texto = "café com açúcar, à moda antiga".normalize("NFC");
    const conteudo = encoder.encode(texto);
    const hash = await hashDe(conteudo);

    await aplicarLote(ctx, loteDe([
      { tipo: "gravar", caminho: "notas/café.md", base: null, hash, conteudo },
    ]));

    const bytesNoDisco = await adaptador.lerBinario("notas/café.md");
    expect(await hashDe(bytesNoDisco)).toBe(hash);
    expect(await adaptador.lerTexto("notas/café.md")).toBe(texto);
  });
});

describe("aplicarLote — flushTudo", () => {
  it("é chamado antes de ler hashes locais (antes de listar o vault)", async () => {
    const adaptador = new VaultAdapterMemoria();
    await adaptador.escreverTexto("nota.md", "x");
    const estado = estadoVazio();
    const ctx = contexto(adaptador, estado);
    const listarSpy = vi.spyOn(adaptador, "listar");

    await aplicarLote(ctx, loteDe([]));

    expect(ctx.flushTudoMock).toHaveBeenCalledTimes(1);
    const ordemFlush = ctx.flushTudoMock.mock.invocationCallOrder[0];
    const ordemListar = listarSpy.mock.invocationCallOrder[0];
    expect(ordemFlush).toBeLessThan(ordemListar);
  });
});
