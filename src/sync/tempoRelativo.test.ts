// src/sync/tempoRelativo.test.ts
// Escrito ANTES da implementação (visto falhando) — plano 12 Task 6.

import { describe, it, expect } from "vitest";

import { tempoRelativo } from "./tempoRelativo";

const AGORA = new Date("2026-09-28T12:00:00.000Z");

describe("tempoRelativo", () => {
  it("menos de um minuto: agora", () => {
    const desde = new Date(AGORA.getTime() - 30_000);
    expect(tempoRelativo(desde, AGORA)).toEqual({ unidade: "agora", valor: 0 });
  });

  it("minutos: arredonda para baixo", () => {
    const desde = new Date(AGORA.getTime() - 5 * 60_000 - 30_000); // 5min30s
    expect(tempoRelativo(desde, AGORA)).toEqual({ unidade: "minutos", valor: 5 });
  });

  it("59 minutos ainda é minutos, não horas", () => {
    const desde = new Date(AGORA.getTime() - 59 * 60_000);
    expect(tempoRelativo(desde, AGORA)).toEqual({ unidade: "minutos", valor: 59 });
  });

  it("horas: arredonda para baixo", () => {
    const desde = new Date(AGORA.getTime() - 3 * 3_600_000 - 60_000); // 3h01min
    expect(tempoRelativo(desde, AGORA)).toEqual({ unidade: "horas", valor: 3 });
  });

  it("23 horas ainda é horas, não dias", () => {
    const desde = new Date(AGORA.getTime() - 23 * 3_600_000);
    expect(tempoRelativo(desde, AGORA)).toEqual({ unidade: "horas", valor: 23 });
  });

  it("dias: arredonda para baixo", () => {
    const desde = new Date(AGORA.getTime() - 2 * 86_400_000 - 3_600_000); // 2 dias e 1h
    expect(tempoRelativo(desde, AGORA)).toEqual({ unidade: "dias", valor: 2 });
  });

  it("desde no futuro (relógio dessincronizado): agora, nunca negativo", () => {
    const desde = new Date(AGORA.getTime() + 60_000);
    expect(tempoRelativo(desde, AGORA)).toEqual({ unidade: "agora", valor: 0 });
  });
});
