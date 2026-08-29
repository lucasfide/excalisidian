import { describe, it, expect } from "vitest";

import { nivelDoHeading, blockIdDaLinha } from "./sintaxe";

describe("sintaxe — fonte única para o parser do índice", () => {
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
});
