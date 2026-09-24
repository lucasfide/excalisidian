import { describe, it, expect } from "vitest";

import { construirIndiceResolucao, resolverLink } from "./resolucao";

describe("resolverLink — ponto final do nome (doc 02 §9)", () => {
  it("[[Frase.]] resolve para Frase..md", () => {
    const indice = construirIndiceResolucao(["Frase..md"]);
    expect(resolverLink(indice, "Frase.", "Origem.md")).toBe("Frase..md");
  });

  it("[[Frase.]] resolve para o desenho Frase..draw.md quando não há nota com esse nome", () => {
    const indice = construirIndiceResolucao(["Frase..draw.md"]);
    expect(resolverLink(indice, "Frase.", "Origem.md")).toBe("Frase..draw.md");
  });

  it("[[Frase..draw]] resolve para o desenho explicitamente", () => {
    const indice = construirIndiceResolucao(["Frase..md", "Frase..draw.md"]);
    expect(resolverLink(indice, "Frase..draw", "Origem.md")).toBe("Frase..draw.md");
  });

  it("nota vence o desenho quando ambos têm o nome terminado em ponto", () => {
    const indice = construirIndiceResolucao(["Frase..md", "Frase..draw.md"]);
    expect(resolverLink(indice, "Frase.", "Origem.md")).toBe("Frase..md");
  });
});
