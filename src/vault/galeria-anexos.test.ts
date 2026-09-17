import { describe, expect, it, vi } from "vitest";

import {
  criarUrlBlobImagem,
  embedMarkdownDoAnexo,
  filtrarImagensAnexos,
} from "./galeria-anexos";

describe("galeria de anexos", () => {
  it("filtra apenas imagens de arquivos dentro de anexos", () => {
    expect(
      filtrarImagensAnexos([
        { path: "anexos/zeta.png", isDir: false, size: 2, mtimeMs: 2, birthtimeMs: 2 },
        { path: "anexos/sub/alpha.JPG", isDir: false, size: 1, mtimeMs: 1, birthtimeMs: 1 },
        { path: "anexos/notas.md", isDir: false, size: 1, mtimeMs: 1, birthtimeMs: 1 },
        { path: "anexos", isDir: true, size: 0, mtimeMs: 0, birthtimeMs: 0 },
        { path: "outra.png", isDir: false, size: 1, mtimeMs: 1, birthtimeMs: 1 },
      ]),
    ).toMatchObject([
      { path: "anexos/sub/alpha.JPG", nome: "alpha.JPG", mime: "image/jpeg" },
      { path: "anexos/zeta.png", nome: "zeta.png", mime: "image/png" },
    ]);
  });

  it("cria uma URL Blob revogável e não revoga duas vezes", () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    const blob = criarUrlBlobImagem(new Uint8Array([1, 2]), "image/png");
    expect(blob.url).toBe("blob:test");
    blob.revogar();
    blob.revogar();
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledOnce();

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it("gera o embed Markdown explícito", () => {
    expect(embedMarkdownDoAnexo("anexos/foto.png")).toBe("![[anexos/foto.png]]");
  });
});
