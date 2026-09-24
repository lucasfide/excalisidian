// src/ui/excalisidian/abasPreferencias.test.ts
// Lógica pura de navegação das abas de `DialogoPreferencias` (sem testing-library/jsdom —
// só a lógica, testada em isolamento; ver o comentário de topo de `abasPreferencias.ts`).

import { describe, it, expect } from "vitest";

import { ABAS_PREFERENCIAS, abaInicial, abaPorTecla } from "./abasPreferencias";

describe("abaInicial", () => {
  it("secaoInicial vence a última aba usada", () => {
    expect(abaInicial("conta", "agente")).toBe("conta");
  });

  it("sem secaoInicial nem última aba, cai em geral", () => {
    expect(abaInicial(undefined)).toBe("geral");
  });

  it("sem secaoInicial, reabre a última aba usada", () => {
    expect(abaInicial(undefined, "aparencia")).toBe("aparencia");
  });
});

describe("abaPorTecla", () => {
  it("seta para baixo avança e volta ao início no fim da lista", () => {
    expect(abaPorTecla("geral", "ArrowDown")).toBe("aparencia");
    expect(abaPorTecla("agente", "ArrowDown")).toBe("geral");
  });

  it("seta para cima recua e volta ao fim no início da lista", () => {
    expect(abaPorTecla("aparencia", "ArrowUp")).toBe("geral");
    expect(abaPorTecla("geral", "ArrowUp")).toBe("agente");
  });

  it("seta para a direita se comporta como seta para baixo", () => {
    expect(abaPorTecla("agente", "ArrowRight")).toBe("geral");
  });

  it("seta para a esquerda se comporta como seta para cima", () => {
    expect(abaPorTecla("geral", "ArrowLeft")).toBe("agente");
  });

  it("Home vai para a primeira aba", () => {
    expect(abaPorTecla("agente", "Home")).toBe("geral");
  });

  it("End vai para a última aba", () => {
    expect(abaPorTecla("geral", "End")).toBe("agente");
  });

  it("tecla que não navega devolve null", () => {
    expect(abaPorTecla("geral", "a")).toBeNull();
    expect(abaPorTecla("geral", "Tab")).toBeNull();
  });

  it("a lista de abas está na ordem esperada", () => {
    expect(ABAS_PREFERENCIAS).toEqual(["geral", "aparencia", "conta", "agente"]);
  });
});
