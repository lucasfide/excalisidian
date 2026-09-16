import { describe, it, expect, vi } from "vitest";

vi.mock("../../vault/anexos", () => ({ PASTA_ANEXOS: "anexos", salvarImagemColada: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { deveColarComoImagem, textoDosEmbeds } from "./colarImagem";

describe("deveColarComoImagem", () => {
  it("cola como imagem quando só há imagem", () => {
    expect(deveColarComoImagem("", 1)).toBe(true);
  });

  it("não cola como imagem quando vem texto junto (Word, Excel, navegador)", () => {
    expect(deveColarComoImagem("parágrafo copiado", 1)).toBe(false);
  });

  it("sem imagem, deixa o colar normal", () => {
    expect(deveColarComoImagem("", 0)).toBe(false);
  });
});

describe("textoDosEmbeds", () => {
  it("um embed por linha, com o caminho completo", () => {
    expect(textoDosEmbeds(["anexos/a.png", "anexos/b.jpg"])).toBe(
      "![[anexos/a.png]]\n![[anexos/b.jpg]]",
    );
  });
});
