import { describe, it, expect } from "vitest";

import { nivelDoHeading, blockIdDaLinha, ehLinhaDeEmbed } from "./sintaxe";

describe("sintaxe — fonte única entre parser.ts e marginalia.ts", () => {
  it("nivelDoHeading conta os # e tolera os de fechamento", () => {
    expect(nivelDoHeading("# Título")).toBe(1);
    expect(nivelDoHeading("### Sub ###")).toBe(3);
    expect(nivelDoHeading("texto comum")).toBe(0);
    expect(nivelDoHeading("#sem espaço")).toBe(0);
  });

  it("blockIdDaLinha pega o ^id no fim da linha", () => {
    expect(blockIdDaLinha("Uma frase. ^dec-3")).toBe("dec-3");
    expect(blockIdDaLinha("^sozinho")).toBe("sozinho");
    expect(blockIdDaLinha("não tem id aqui")).toBeNull();
    expect(blockIdDaLinha("texto ^com_underscore")).toBeNull(); // _ não é aceito
  });

  it("ehLinhaDeEmbed reconhece ![[...]] em qualquer posição da linha", () => {
    expect(ehLinhaDeEmbed("![[Desenho.draw]]")).toBe(true);
    expect(ehLinhaDeEmbed("Antes ![[Desenho.draw|400]] depois")).toBe(true);
    expect(ehLinhaDeEmbed("[[Nota]] sem bang")).toBe(false);
    expect(ehLinhaDeEmbed("texto comum")).toBe(false);
  });
});
