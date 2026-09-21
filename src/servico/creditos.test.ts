// src/servico/creditos.test.ts
import { describe, it, expect } from "vitest";

import {
  restantes,
  fracaoUsada,
  nivelDeAviso,
  formatarCreditos,
  type SaldoCreditos,
} from "./creditos";

const saldo = (usados: number, total: number): SaldoCreditos => ({
  usados,
  total,
  renovaEm: 0,
});

describe("restantes", () => {
  it("é o total menos o usado", () => {
    expect(restantes(saldo(300, 2000))).toBe(1700);
  });

  it("nunca é negativo, mesmo se o servidor deixar estourar", () => {
    expect(restantes(saldo(2500, 2000))).toBe(0);
  });
});

describe("fracaoUsada", () => {
  it("é a proporção do total", () => {
    expect(fracaoUsada(saldo(500, 2000))).toBe(0.25);
  });

  it("satura em 1 quando estourou", () => {
    expect(fracaoUsada(saldo(2500, 2000))).toBe(1);
  });

  it("total zero conta como tudo usado, não como divisão por zero", () => {
    expect(fracaoUsada(saldo(0, 0))).toBe(1);
  });
});

describe("nivelDeAviso", () => {
  it("é ok enquanto sobra mais de 10%", () => {
    expect(nivelDeAviso(saldo(0, 2000))).toBe("ok");
    expect(nivelDeAviso(saldo(1799, 2000))).toBe("ok");
  });

  it("vira acabando nos últimos 10%", () => {
    expect(nivelDeAviso(saldo(1800, 2000))).toBe("acabando");
    expect(nivelDeAviso(saldo(1999, 2000))).toBe("acabando");
  });

  it("vira esgotado quando não sobra nada", () => {
    expect(nivelDeAviso(saldo(2000, 2000))).toBe("esgotado");
    expect(nivelDeAviso(saldo(2500, 2000))).toBe("esgotado");
  });
});

describe("formatarCreditos", () => {
  it("usa separador de milhar", () => {
    expect(formatarCreditos(1700)).toBe("1.700");
  });

  it("não inventa casa decimal", () => {
    expect(formatarCreditos(5)).toBe("5");
  });

  it("arredonda para baixo, para nunca prometer crédito que não existe", () => {
    expect(formatarCreditos(1699.9)).toBe("1.699");
  });
});
