// src/sync/pastaDeDownload.test.ts
// Escrito ANTES da implementação (visto falhando) — plano 12 Task 6.

import { describe, it, expect } from "vitest";

import { proximoNomeDePasta } from "./pastaDeDownload";

describe("proximoNomeDePasta", () => {
  it("nome livre: devolve o próprio nome", () => {
    expect(proximoNomeDePasta("Notas", () => false)).toBe("Notas");
  });

  it("nome ocupado: devolve 'Nome (2)'", () => {
    const ocupados = new Set(["Notas"]);
    expect(proximoNomeDePasta("Notas", (n) => ocupados.has(n))).toBe("Notas (2)");
  });

  it("nome e 'Nome (2)' ocupados: devolve 'Nome (3)'", () => {
    const ocupados = new Set(["Notas", "Notas (2)"]);
    expect(proximoNomeDePasta("Notas", (n) => ocupados.has(n))).toBe("Notas (3)");
  });

  it("vários já ocupados em sequência: continua até achar o primeiro livre", () => {
    const ocupados = new Set(["Notas", "Notas (2)", "Notas (3)", "Notas (4)"]);
    expect(proximoNomeDePasta("Notas", (n) => ocupados.has(n))).toBe("Notas (5)");
  });

  it("nunca mistura com a pasta existente: o candidato livre nunca é um dos ocupados", () => {
    const ocupados = new Set(["Vault sem nome", "Vault sem nome (2)"]);
    const resultado = proximoNomeDePasta("Vault sem nome", (n) => ocupados.has(n));
    expect(ocupados.has(resultado)).toBe(false);
  });
});
