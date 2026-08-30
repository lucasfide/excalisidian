import { describe, it, expect } from "vitest";
import { pontuar } from "./pontuarComando";

describe("pontuar (ranking da paleta de comandos)", () => {
  it("sem consulta, tudo empata em 0", () => {
    expect(pontuar("Nova nota", "")).toBe(0);
  });

  it("começa com pontua mais que só conter", () => {
    expect(pontuar("Nova nota", "nova")).toBe(2);
    expect(pontuar("Fechar aba", "aba")).toBe(1);
  });

  it("não bate devolve negativo (é filtrado fora)", () => {
    expect(pontuar("Nova nota", "xyz")).toBe(-1);
  });

  it("é case-insensitive", () => {
    expect(pontuar("Nova nota", "NOVA")).toBe(2);
  });
});
