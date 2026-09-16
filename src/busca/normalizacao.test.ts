import { describe, it, expect } from "vitest";
import { dobrar } from "./normalizacao";

describe("dobrar", () => {
  it("minúsculas e sem diacríticos", () => {
    expect(dobrar("ÇÃO")).toBe("cao");
    expect(dobrar("São Paulo")).toBe("sao paulo");
    expect(dobrar("Reunião")).toBe("reuniao");
  });

  it("texto sem acento fica igual, só em minúsculas", () => {
    expect(dobrar("Orcamento")).toBe("orcamento");
  });

  it("preserva o comprimento em UTF-16 para texto NFC (índices continuam batendo)", () => {
    for (const texto of ["ÇÃO", "São Paulo", "Reunião de segunda", "🎉 festa 🎉"]) {
      expect(dobrar(texto.normalize("NFC")).length).toBe(texto.normalize("NFC").length);
    }
  });

  it("não quebra em emoji (sem marca combinante para remover)", () => {
    expect(dobrar("🎉 Festa 🎉")).toBe("🎉 festa 🎉");
  });
});
