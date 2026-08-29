import { describe, it, expect } from "vitest";

import { alvoDeLinkWiki } from "./linkElemento";

describe("alvoDeLinkWiki — link de elemento do canvas (Fatia 7)", () => {
  it("extrai o alvo de um wikilink simples", () => {
    expect(alvoDeLinkWiki("[[Arquitetura]]")).toBe("Arquitetura");
  });

  it("extrai o alvo ignorando subcaminho e alias", () => {
    expect(alvoDeLinkWiki("[[Projetos/Arquitetura#Backend|o backend]]")).toBe(
      "Projetos/Arquitetura",
    );
  });

  it("tolera espaço em volta do link", () => {
    expect(alvoDeLinkWiki("  [[Arquitetura]]  ")).toBe("Arquitetura");
  });

  it("devolve null para URL externa", () => {
    expect(alvoDeLinkWiki("https://excalidraw.com")).toBeNull();
  });

  it("devolve null quando o miolo não é um wikilink bem formado", () => {
    expect(alvoDeLinkWiki("[[a[b]]")).toBeNull();
  });

  it("devolve null para alvo com caractere proibido (analisarMiolo.invalido)", () => {
    expect(alvoDeLinkWiki("[[a^b]]")).toBeNull();
  });
});
