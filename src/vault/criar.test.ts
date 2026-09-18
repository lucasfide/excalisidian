import { describe, it, expect, vi, beforeEach } from "vitest";

const arquivos = new Map<string, string>();
const adapter = {
  existe: vi.fn(async (p: string) => arquivos.has(p)),
  lerTexto: vi.fn(async (p: string) => arquivos.get(p) ?? ""),
  escreverTexto: vi.fn(async (p: string, t: string) => void arquivos.set(p, t)),
  criarPasta: vi.fn(async () => {}),
};
const vaultState = {
  adapter,
  recarregarArvore: vi.fn(async () => {}),
  reindexarArquivo: vi.fn(async () => {}),
  modoOrdenacao: "alphabetical" as "alphabetical" | "custom",
  registrarItemCriado: vi.fn(async () => {}),
};
vi.mock("../estado/vaultStore", () => ({
  useVaultStore: { getState: () => vaultState },
}));

import { duplicarArquivo, separarExtensao } from "./criar";

beforeEach(() => {
  arquivos.clear();
  vaultState.modoOrdenacao = "alphabetical";
  vaultState.registrarItemCriado.mockClear();
});

describe("separarExtensao", () => {
  it("reconhece .draw.md antes de .md", () => {
    expect(separarExtensao("pasta/Fluxo.draw.md")).toEqual({ base: "pasta/Fluxo", ext: ".draw.md" });
    expect(separarExtensao("Nota.md")).toEqual({ base: "Nota", ext: ".md" });
  });
});

describe("duplicarArquivo", () => {
  it("nota: próximo nome livre na mesma pasta, com o H1 acompanhando o nome novo", async () => {
    arquivos.set("pasta/Reunião.md", "# Reunião\n\ncorpo");
    arquivos.set("pasta/Reunião (2).md", "# Reunião (2)\n");

    const r = await duplicarArquivo("pasta/Reunião.md");

    expect(r).toEqual({ ok: true, caminho: "pasta/Reunião (3).md" });
    expect(arquivos.get("pasta/Reunião (3).md")).toBe("# Reunião (3)\n\ncorpo");
    expect(arquivos.get("pasta/Reunião.md")).toBe("# Reunião\n\ncorpo");
  });

  it("desenho: copia o conteúdo sem mexer", async () => {
    arquivos.set("Fluxo.draw.md", "conteudo do desenho");

    const r = await duplicarArquivo("Fluxo.draw.md");

    expect(r).toEqual({ ok: true, caminho: "Fluxo (2).draw.md" });
    expect(arquivos.get("Fluxo (2).draw.md")).toBe("conteudo do desenho");
  });
});

describe("criarNota/criarPasta — registram no customOrder quando o modo é custom", () => {
  it("modo alphabetical: não chama registrarItemCriado", async () => {
    const { criarNota } = await import("./criar");
    await criarNota("Nota", "");
    expect(vaultState.registrarItemCriado).not.toHaveBeenCalled();
  });

  it("modo custom: registra a pasta e o nome-base do arquivo criado", async () => {
    vaultState.modoOrdenacao = "custom";
    const { criarNota } = await import("./criar");
    const r = await criarNota("Nota", "Projetos");
    expect(r.ok).toBe(true);
    expect(vaultState.registrarItemCriado).toHaveBeenCalledWith("Projetos", "Nota.md");
  });

  it("modo custom: pasta nova também é registrada, na raiz", async () => {
    vaultState.modoOrdenacao = "custom";
    const { criarPasta } = await import("./criar");
    const r = await criarPasta("Nova Pasta", "");
    expect(r.ok).toBe(true);
    expect(vaultState.registrarItemCriado).toHaveBeenCalledWith("", "Nova Pasta");
  });
});
