// src/vault/efeitosDeGravacao.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { excluirMock } = vi.hoisted(() => ({
  excluirMock: vi.fn(
    async (_caminho: string): Promise<{ ok: true } | { ok: false; motivo: string }> => ({
      ok: true,
    }),
  ),
}));

vi.mock("./lixeira", () => ({
  excluir: excluirMock,
}));

const { recarregarArvoreMock, reindexarArquivoMock } = vi.hoisted(() => ({
  recarregarArvoreMock: vi.fn(async () => {}),
  reindexarArquivoMock: vi.fn(async (_p: string) => {}),
}));
vi.mock("../estado/vaultStore", () => ({
  useVaultStore: {
    getState: () => ({
      recarregarArvore: recarregarArvoreMock,
      reindexarArquivo: reindexarArquivoMock,
    }),
  },
}));

const { cancelarAutosaveMock, recarregarDoDiscoMock } = vi.hoisted(() => ({
  cancelarAutosaveMock: vi.fn((_p: string) => {}),
  recarregarDoDiscoMock: vi.fn(async (_p: string) => {}),
}));
vi.mock("../estado/documentosStore", () => ({
  useDocumentosStore: {
    getState: () => ({
      cancelarAutosave: cancelarAutosaveMock,
      recarregarDoDisco: recarregarDoDiscoMock,
    }),
  },
}));

import {
  efeitosReais,
  gravarComEfeitos,
  gravarLoteComEfeitos,
  type EfeitosDeGravacao,
} from "./efeitosDeGravacao";
import type { VaultAdapter } from "./VaultAdapter";

function adaptadorFalso() {
  const arquivos = new Map<string, string | Uint8Array>();
  const chamadas: string[] = [];
  const escreverTexto = vi.fn(async (caminho: string, conteudo: string) => {
    chamadas.push(`escreverTexto:${caminho}`);
    arquivos.set(caminho, conteudo);
  });
  const escreverBinario = vi.fn(async (caminho: string, dados: Uint8Array) => {
    chamadas.push(`escreverBinario:${caminho}`);
    arquivos.set(caminho, dados);
  });
  return {
    escreverTexto,
    escreverBinario,
    arquivos,
    chamadas,
  } as unknown as VaultAdapter & {
    escreverTexto: typeof escreverTexto;
    escreverBinario: typeof escreverBinario;
    arquivos: Map<string, string | Uint8Array>;
    chamadas: string[];
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

beforeEach(() => {
  excluirMock.mockClear();
  recarregarArvoreMock.mockClear();
  reindexarArquivoMock.mockClear();
  cancelarAutosaveMock.mockClear();
  recarregarDoDiscoMock.mockClear();
});

describe("efeitosReais", () => {
  it("moverParaLixeira delega inteiramente a excluir", async () => {
    excluirMock.mockResolvedValueOnce({ ok: false, motivo: "Nenhum vault aberto." });
    const resultado = await efeitosReais().moverParaLixeira("nota.md");
    expect(excluirMock).toHaveBeenCalledWith("nota.md");
    expect(resultado).toEqual({ ok: false, motivo: "Nenhum vault aberto." });
  });

  it("recarregarArvore chama o vaultStore real", async () => {
    await efeitosReais().recarregarArvore();
    expect(recarregarArvoreMock).toHaveBeenCalledTimes(1);
  });

  it("reindexarArquivo chama o vaultStore real com o caminho", async () => {
    await efeitosReais().reindexarArquivo("a.md");
    expect(reindexarArquivoMock).toHaveBeenCalledWith("a.md");
  });

  it("cancelarAutosavePendente chama o documentosStore real com o caminho", () => {
    efeitosReais().cancelarAutosavePendente("a.md");
    expect(cancelarAutosaveMock).toHaveBeenCalledWith("a.md");
  });

  it("recarregarDoDisco chama o documentosStore real com o caminho", async () => {
    await efeitosReais().recarregarDoDisco("a.md");
    expect(recarregarDoDiscoMock).toHaveBeenCalledWith("a.md");
  });
});

describe("gravarComEfeitos", () => {
  it("texto: cancela o autosave ANTES de escrever, grava, e recarrega árvore/índice/aba nessa ordem", async () => {
    const adaptador = adaptadorFalso();
    const efeitos = efeitosFalsos();

    await gravarComEfeitos(adaptador, efeitos, "nota.md", "conteúdo novo");

    expect(adaptador.escreverTexto).toHaveBeenCalledWith("nota.md", "conteúdo novo");
    expect(adaptador.escreverBinario).not.toHaveBeenCalled();
    expect(efeitos.chamadas).toEqual([
      "cancelarAutosavePendente:nota.md",
      "recarregarArvore",
      "reindexarArquivo:nota.md",
      "recarregarDoDisco:nota.md",
    ]);
  });

  it("binário: usa escreverBinario, não escreverTexto", async () => {
    const adaptador = adaptadorFalso();
    const efeitos = efeitosFalsos();
    const dados = new Uint8Array([1, 2, 3]);

    await gravarComEfeitos(adaptador, efeitos, "imagem.png", dados);

    expect(adaptador.escreverBinario).toHaveBeenCalledWith("imagem.png", dados);
    expect(adaptador.escreverTexto).not.toHaveBeenCalled();
  });

  it("cancela o autosave antes de a escrita começar, não depois", async () => {
    const adaptador = adaptadorFalso();
    const efeitos = efeitosFalsos();

    await gravarComEfeitos(adaptador, efeitos, "nota.md", "x");

    const iCancelou = efeitos.chamadas.indexOf("cancelarAutosavePendente:nota.md");
    const iEscreveu = adaptador.chamadas.indexOf("escreverTexto:nota.md");
    expect(iCancelou).toBe(0);
    expect(iEscreveu).toBeGreaterThan(-1);
  });
});

describe("gravarLoteComEfeitos", () => {
  it("grava N arquivos e recarrega a árvore uma vez só, não uma por arquivo", async () => {
    const adaptador = adaptadorFalso();
    const efeitos = efeitosFalsos();

    await gravarLoteComEfeitos(adaptador, efeitos, [
      { caminho: "a.md", conteudo: "conteúdo a" },
      { caminho: "b.md", conteudo: "conteúdo b" },
      { caminho: "c.png", conteudo: new Uint8Array([9]) },
    ]);

    expect(adaptador.escreverTexto).toHaveBeenCalledWith("a.md", "conteúdo a");
    expect(adaptador.escreverTexto).toHaveBeenCalledWith("b.md", "conteúdo b");
    expect(adaptador.escreverBinario).toHaveBeenCalledWith("c.png", new Uint8Array([9]));
    expect(efeitos.recarregarArvore).toHaveBeenCalledTimes(1);
    expect(efeitos.reindexarArquivo).toHaveBeenCalledWith("a.md");
    expect(efeitos.reindexarArquivo).toHaveBeenCalledWith("b.md");
    expect(efeitos.reindexarArquivo).toHaveBeenCalledWith("c.png");
    expect(efeitos.recarregarDoDisco).toHaveBeenCalledWith("a.md");
    expect(efeitos.recarregarDoDisco).toHaveBeenCalledWith("b.md");
    expect(efeitos.recarregarDoDisco).toHaveBeenCalledWith("c.png");
  });

  it("cancela o autosave de todos ANTES de gravar qualquer um", async () => {
    const adaptador = adaptadorFalso();
    const efeitos = efeitosFalsos();

    await gravarLoteComEfeitos(adaptador, efeitos, [
      { caminho: "a.md", conteudo: "x" },
      { caminho: "b.md", conteudo: "y" },
    ]);

    // invocationCallOrder é global entre todos os mocks — comparável entre os dois objetos
    // falsos, diferente de comparar índice dentro de cada `chamadas` (arrays separados).
    const ordemCancelaA = (efeitos.cancelarAutosavePendente as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    const ordemCancelaB = (efeitos.cancelarAutosavePendente as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[1];
    const ordemEscreveA = adaptador.escreverTexto.mock.invocationCallOrder[0];
    const ordemEscreveB = adaptador.escreverTexto.mock.invocationCallOrder[1];
    expect(ordemCancelaA).toBeLessThan(ordemEscreveA);
    expect(ordemCancelaB).toBeLessThan(ordemEscreveA); // cancela os dois antes de escrever qualquer um
    expect(ordemCancelaB).toBeLessThan(ordemEscreveB);
  });

  it("lote vazio não recarrega a árvore", async () => {
    const adaptador = adaptadorFalso();
    const efeitos = efeitosFalsos();

    await gravarLoteComEfeitos(adaptador, efeitos, []);

    expect(efeitos.recarregarArvore).not.toHaveBeenCalled();
  });
});
