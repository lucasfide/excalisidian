import { describe, it, expect } from "vitest";
import { saudacaoPorHorario } from "./sistemaOperacional";

describe("saudacaoPorHorario", () => {
  it("madrugada é boa noite", () => {
    expect(saudacaoPorHorario(3)).toBe("Boa noite");
  });
  it("manhã é bom dia", () => {
    expect(saudacaoPorHorario(9)).toBe("Bom dia");
  });
  it("meio-dia em diante é boa tarde", () => {
    expect(saudacaoPorHorario(12)).toBe("Boa tarde");
    expect(saudacaoPorHorario(17)).toBe("Boa tarde");
  });
  it("noite é boa noite", () => {
    expect(saudacaoPorHorario(18)).toBe("Boa noite");
    expect(saudacaoPorHorario(23)).toBe("Boa noite");
  });
});
