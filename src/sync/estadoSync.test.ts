import { describe, it, expect, beforeEach, vi } from "vitest";

// Um "disco" por caminho de arquivo, imitando o plugin-store: cada `load(caminho)` devolve um
// store isolado, igual ao padrão de `src/estado/contaStore.test.ts`.
const discos: Record<string, Record<string, unknown>> = {};

vi.mock("@tauri-apps/plugin-store", () => ({
  load: async (caminho: string) => {
    const disco = (discos[caminho] ??= {});
    return {
      get: async (k: string) => disco[k],
      set: async (k: string, v: unknown) => {
        disco[k] = v;
      },
      delete: async (k: string) => {
        delete disco[k];
      },
      clear: async () => {
        for (const k of Object.keys(disco)) delete disco[k];
      },
      save: async () => {},
    };
  },
}));

const invokeMock = vi.fn(async (..._args: unknown[]) => "");
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import {
  carregarEstadoSync,
  salvarEstadoSync,
  esquecer,
  lerNomeDoComputador,
  gravarNomeDoComputador,
  type EstadoSync,
} from "./estadoSync";

const RAIZ = "C:/vaults/pessoal";

function estadoDeExemplo(): EstadoSync {
  return {
    idDoVault: "vault-123",
    cursor: 7,
    bases: { "nota.md": "hash-a" },
    hashesConhecidos: { "nota.md": { mtimeMs: 1000, size: 42, hash: "hash-a" } },
    conflitosPendentes: {
      "outra.md": {
        hashRemoto: "hash-b",
        conteudo: "# remoto",
        dispositivo: "Notebook do Lucas",
        criadoEm: "2026-09-24T10:00:00.000Z",
      },
    },
  };
}

describe("estadoSync", () => {
  beforeEach(() => {
    for (const k of Object.keys(discos)) delete discos[k];
    invokeMock.mockClear();
    invokeMock.mockResolvedValue("");
  });

  it("nunca gravado: carregar devolve null", async () => {
    expect(await carregarEstadoSync(RAIZ)).toBeNull();
  });

  it("ida e volta: grava e lê de volta o mesmo estado", async () => {
    const estado = estadoDeExemplo();
    await salvarEstadoSync(RAIZ, estado);
    expect(await carregarEstadoSync(RAIZ)).toEqual(estado);
  });

  it("vault diferente usa arquivo diferente (não colide)", async () => {
    const estadoA = estadoDeExemplo();
    const estadoB = { ...estadoDeExemplo(), idDoVault: "vault-456", cursor: 1 };
    await salvarEstadoSync("C:/vaults/pessoal", estadoA);
    await salvarEstadoSync("C:/vaults/trabalho", estadoB);
    expect(await carregarEstadoSync("C:/vaults/pessoal")).toEqual(estadoA);
    expect(await carregarEstadoSync("C:/vaults/trabalho")).toEqual(estadoB);
  });

  it("versão de formato diferente da esperada vira null", async () => {
    await salvarEstadoSync(RAIZ, estadoDeExemplo());
    // Simula um arquivo de uma versão futura (ou antiga) do formato, gravado por fora.
    const caminho = Object.keys(discos).find((c) => c.startsWith("sync-"))!;
    const bruto = discos[caminho]!.estado as { version: number };
    discos[caminho]!.estado = { ...bruto, version: bruto.version + 1 };

    expect(await carregarEstadoSync(RAIZ)).toBeNull();
  });

  it("esquecer apaga o estado: depois disso carregar devolve null", async () => {
    await salvarEstadoSync(RAIZ, estadoDeExemplo());
    expect(await carregarEstadoSync(RAIZ)).not.toBeNull();

    await esquecer(RAIZ);

    expect(await carregarEstadoSync(RAIZ)).toBeNull();
  });

  it("esquecer não afeta o estado de outro vault", async () => {
    const estadoB = { ...estadoDeExemplo(), idDoVault: "vault-456" };
    await salvarEstadoSync("C:/vaults/pessoal", estadoDeExemplo());
    await salvarEstadoSync("C:/vaults/trabalho", estadoB);

    await esquecer("C:/vaults/pessoal");

    expect(await carregarEstadoSync("C:/vaults/pessoal")).toBeNull();
    expect(await carregarEstadoSync("C:/vaults/trabalho")).toEqual(estadoB);
  });

  it("nome do computador nunca definido: usa o nome do SO + '(este computador)'", async () => {
    invokeMock.mockResolvedValueOnce("Lucas");
    expect(await lerNomeDoComputador()).toBe("Lucas (este computador)");
    expect(invokeMock).toHaveBeenCalledWith("nome_usuario");
  });

  it("comando do SO falha: usa só '(este computador)'", async () => {
    invokeMock.mockRejectedValueOnce(new Error("sem SO"));
    expect(await lerNomeDoComputador()).toBe("(este computador)");
  });

  it("gravar e ler: o nome escolhido pelo usuário vence o padrão do SO", async () => {
    await gravarNomeDoComputador("PC da sala");
    expect(await lerNomeDoComputador()).toBe("PC da sala");
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("gravar usa uma chave própria em settings.json, sem colidir com as existentes", async () => {
    await gravarNomeDoComputador("PC da sala");
    const chavesExistentes = [
      "tema",
      "idioma",
      "larguraNota",
      "sidebarColapsada",
      "barraFormatacaoAcoplada",
      "nomeUsuario",
      "asciiPeaksHabilitado",
      "tokenConta",
      "agente",
      "painelTarefasAberto",
      "larguraPainelTarefas",
    ];
    const chaves = Object.keys(discos["settings.json"] ?? {});
    expect(chaves).toContain("nomeDoComputador");
    for (const chave of chaves) {
      if (chave === "nomeDoComputador") continue;
      expect(chavesExistentes).not.toContain(chave);
    }
  });

  it("gravar nome vazio (trim) faz lerNomeDoComputador voltar ao padrão do SO", async () => {
    await gravarNomeDoComputador("   ");
    invokeMock.mockResolvedValueOnce("Maria");
    expect(await lerNomeDoComputador()).toBe("Maria (este computador)");
  });
});
