import { describe, it, expect } from "vitest";

import {
  validarNomeArquivo,
  normalizarCaminho,
  chaveCanonica,
} from "./caminhos";

describe("validarNomeArquivo (doc 02 §9)", () => {
  it("recusa nome reservado do Windows, com ou sem extensão", () => {
    expect(validarNomeArquivo("CON.md").ok).toBe(false);
    expect(validarNomeArquivo("con").ok).toBe(false);
    expect(validarNomeArquivo("LPT1.md").ok).toBe(false);
  });

  it("recusa caractere proibido", () => {
    expect(validarNomeArquivo("a:b.md").ok).toBe(false);
    expect(validarNomeArquivo('x"y.md').ok).toBe(false);
  });

  it("recusa nome terminado em ponto ou espaço", () => {
    expect(validarNomeArquivo("Nota.").ok).toBe(false);
    expect(validarNomeArquivo("Nota ").ok).toBe(false);
  });

  it("recusa nome vazio", () => {
    expect(validarNomeArquivo("   ").ok).toBe(false);
  });

  it("aceita nome comum", () => {
    expect(validarNomeArquivo("Arquitetura.md").ok).toBe(true);
    expect(validarNomeArquivo("2026-08-28.md").ok).toBe(true);
  });
});

describe("normalização de caminho", () => {
  it("usa / e remove barra final", () => {
    expect(normalizarCaminho("a\\b\\c\\")).toBe("a/b/c");
  });
  it("chave canônica em minúsculas", () => {
    expect(chaveCanonica("Projetos/Arquitetura.md")).toBe(
      "projetos/arquitetura.md",
    );
  });
});
