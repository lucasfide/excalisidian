import { describe, it, expect, vi, beforeEach } from "vitest";

// Mesmo padrão de mock de estado global usado em renomear.test.ts: só os campos que
// abrirOuCriarPorLink de fato lê.
const { arquivos, vaultState, workspaceState } = vi.hoisted(() => {
  const arquivos = new Map<string, string>();
  const vaultState = {
    adapter: {
      async existe(p: string) {
        return arquivos.has(p);
      },
      async escreverTexto(p: string, c: string) {
        arquivos.set(p, c);
      },
      async criarPasta(_p: string) {},
    },
    resolver: (_alvo: string, _origem: string): string | null => null,
    recarregarArvore: async () => {},
    reindexarArquivo: async () => {},
  };
  const workspaceState = {
    abrirDocumento: vi.fn(),
  };
  return { arquivos, vaultState, workspaceState };
});

vi.mock("../estado/vaultStore", () => ({
  useVaultStore: { getState: () => vaultState },
}));
vi.mock("../estado/workspaceStore", () => ({
  useWorkspaceStore: { getState: () => workspaceState },
}));

import { abrirOuCriarPorLink } from "./navegacao";

beforeEach(() => {
  arquivos.clear();
  workspaceState.abrirDocumento.mockClear();
  vaultState.resolver = () => null;
});

describe("abrirOuCriarPorLink — ponto final do alvo (doc 02 §9)", () => {
  it("[[Frase.]] sem nota existente cria Frase..md, sem cortar o ponto", async () => {
    await abrirOuCriarPorLink("Frase.", "Origem.md");

    expect(arquivos.has("Frase..md")).toBe(true);
    expect(arquivos.has("Frase.md")).toBe(false);
    expect(workspaceState.abrirDocumento).toHaveBeenCalledWith("Frase..md");
  });
});
