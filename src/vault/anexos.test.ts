import { describe, it, expect, vi, beforeEach } from "vitest";

const arquivos = new Set<string>();
const adapter = {
  existe: vi.fn(async (p: string) => arquivos.has(p)),
  criarPasta: vi.fn(async () => {}),
  escreverBinario: vi.fn(async (p: string) => void arquivos.add(p)),
};
const vaultState = {
  adapter,
  recarregarArvore: vi.fn(async () => {}),
  reindexarArquivo: vi.fn(async () => {}),
};
vi.mock("../estado/vaultStore", () => ({
  useVaultStore: { getState: () => vaultState },
}));

import { carimboImagemColada, ehImagem, mimeDaImagem, salvarImagemColada } from "./anexos";

beforeEach(() => {
  arquivos.clear();
  vi.useRealTimers();
});

describe("anexos", () => {
  it("carimbo YYYYMMDD-HHmmss na hora local", () => {
    expect(carimboImagemColada(new Date(2026, 8, 6, 9, 5, 7))).toBe("20260906-090507");
  });

  it("reconhece imagem pela extensão, sem diferenciar caixa", () => {
    expect(ehImagem("anexos/Foto.PNG")).toBe(true);
    expect(ehImagem("anexos/doc.pdf")).toBe(false);
    expect(ehImagem("Nota.md")).toBe(false);
    expect(mimeDaImagem("a.svg")).toBe("image/svg+xml");
  });

  it("grava em anexos/, numera colisão no mesmo segundo e reindexa o anexo", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 16, 14, 0, 0));
    const bytes = new Uint8Array([1, 2, 3]);

    const a = await salvarImagemColada(bytes, "png");
    const b = await salvarImagemColada(bytes, "png");

    expect(a).toBe("anexos/Imagem colada 20260916-140000.png");
    expect(b).toBe("anexos/Imagem colada 20260916-140000 (2).png");
    expect(adapter.criarPasta).toHaveBeenCalledWith("anexos");
    expect(vaultState.reindexarArquivo).toHaveBeenCalledWith(a);
  });
});
