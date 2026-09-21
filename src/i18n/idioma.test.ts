// src/i18n/idioma.test.ts
import { describe, it, expect } from "vitest";

import { IDIOMAS, ehIdioma, idiomaDoSistema } from "./idioma";

describe("idioma", () => {
  it("a lista tem exatamente os dois idiomas do produto", () => {
    expect(IDIOMAS).toEqual(["pt-BR", "en"]);
  });

  it("ehIdioma aceita os válidos e recusa o resto", () => {
    expect(ehIdioma("pt-BR")).toBe(true);
    expect(ehIdioma("en")).toBe(true);
    expect(ehIdioma("pt")).toBe(false);
    expect(ehIdioma("")).toBe(false);
    expect(ehIdioma(null)).toBe(false);
    expect(ehIdioma(42)).toBe(false);
  });

  it("qualquer variante de português cai em pt-BR", () => {
    expect(idiomaDoSistema(["pt-BR"])).toBe("pt-BR");
    expect(idiomaDoSistema(["pt-PT"])).toBe("pt-BR");
    expect(idiomaDoSistema(["PT"])).toBe("pt-BR");
  });

  it("qualquer outro idioma cai em inglês", () => {
    expect(idiomaDoSistema(["en-US"])).toBe("en");
    expect(idiomaDoSistema(["fr-FR"])).toBe("en");
    expect(idiomaDoSistema(["ja"])).toBe("en");
  });

  it("a primeira tag reconhecida vence, mesmo com lixo antes", () => {
    expect(idiomaDoSistema(["", "pt-BR", "en-US"])).toBe("pt-BR");
  });

  it("lista vazia cai em inglês, que é o público maior", () => {
    expect(idiomaDoSistema([])).toBe("en");
  });
});
