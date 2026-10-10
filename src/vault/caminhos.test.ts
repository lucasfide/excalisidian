import { describe, it, expect } from "vitest";

import {
  validarNomeArquivo,
  validarNomeRenomear,
  sanitizarNome,
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

describe("validarNomeRenomear (doc 02 §9 — ponto final na nota/desenho)", () => {
  it("aceita ponto final para nota (o nome final termina em .md)", () => {
    expect(validarNomeRenomear("Nota.md", "Frase.")).toBeNull();
  });

  it("aceita ponto final para desenho (o nome final termina em .draw.md)", () => {
    expect(validarNomeRenomear("Fluxo.draw.md", "Frase.")).toBeNull();
  });

  it("recusa ponto final para pasta (o nome digitado é o nome final)", () => {
    expect(validarNomeRenomear("Projetos", "Frase.")).not.toBeNull();
  });

  it("recusa ponto final para anexo (o nome digitado já inclui a extensão)", () => {
    expect(validarNomeRenomear("foto.png", "foto.")).not.toBeNull();
  });

  it("continua recusando caractere proibido e nome reservado", () => {
    expect(validarNomeRenomear("Nota.md", "a:b")).not.toBeNull();
    expect(validarNomeRenomear("Nota.md", "CON")).not.toBeNull();
  });
});

describe("sanitizarNome — vaiReceberExtensao (doc 02 §9)", () => {
  it("sem a opção: corta o ponto final, igual sempre foi", () => {
    expect(sanitizarNome("Frase.")).toBe("Frase");
  });

  it("com vaiReceberExtensao: mantém o ponto final, corta só o espaço", () => {
    expect(sanitizarNome("Frase.", { vaiReceberExtensao: true })).toBe("Frase.");
    expect(sanitizarNome("Frase. ", { vaiReceberExtensao: true })).toBe("Frase.");
  });

  it("com vaiReceberExtensao: ainda substitui caractere proibido e recusa nome reservado", () => {
    expect(sanitizarNome("a:b.", { vaiReceberExtensao: true })).toBe("a-b.");
    expect(sanitizarNome("CON", { vaiReceberExtensao: true })).toBeNull();
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

describe("nome que começa com ponto (o app esconde tudo que começa com '.')", () => {
  it("validarNomeArquivo recusa nome que começa com ponto, com o motivo do catálogo", () => {
    const r = validarNomeArquivo(".ideias.md");
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("O nome não pode começar com ponto.");
    expect(validarNomeArquivo(".draw.md").ok).toBe(false);
  });

  it("sanitizarNome tira os pontos do começo em vez de recusar", () => {
    expect(sanitizarNome(".ideias")).toBe("ideias");
    expect(sanitizarNome("..ideias", { vaiReceberExtensao: true })).toBe("ideias");
    expect(sanitizarNome(". .ideias")).toBe("ideias");
  });

  it("sanitizarNome devolve null se só sobrar ponto", () => {
    expect(sanitizarNome("...")).toBeNull();
    expect(sanitizarNome("..", { vaiReceberExtensao: true })).toBeNull();
  });
});
