// src/i18n/catalogo.test.ts
import { describe, it, expect } from "vitest";

import { PT_BR, EN, CATALOGOS, criarTradutor } from "./catalogo";

const marcadoresDe = (texto: string) => (texto.match(/\{(\w+)\}/g) ?? []).sort();

describe("catálogo", () => {
  it("toda chave do inglês existe no português, que é a fonte da verdade", () => {
    const sobrando = Object.keys(EN).filter((chave) => !(chave in PT_BR));
    expect(sobrando).toEqual([]);
  });

  it("tradução usa exatamente os mesmos marcadores do original", () => {
    const divergentes = Object.entries(EN)
      .filter(([chave, texto]) => {
        const original = PT_BR[chave as keyof typeof PT_BR];
        return String(marcadoresDe(texto as string)) !== String(marcadoresDe(original));
      })
      .map(([chave]) => chave);
    expect(divergentes).toEqual([]);
  });

  it("nenhum texto vem vazio ou só com espaço", () => {
    const vazios = Object.entries({ ...PT_BR, ...EN })
      .filter(([, texto]) => !String(texto).trim())
      .map(([chave]) => chave);
    expect(vazios).toEqual([]);
  });

  it("nenhum texto de interface tem emoji", () => {
    const comEmoji = Object.entries({ ...PT_BR, ...EN })
      .filter(([, texto]) => /\p{Extended_Pictographic}/u.test(String(texto)))
      .map(([chave]) => chave);
    expect(comEmoji).toEqual([]);
  });

  it("CATALOGOS expõe os dois idiomas", () => {
    expect(Object.keys(CATALOGOS).sort()).toEqual(["en", "pt-BR"]);
  });

  it("criarTradutor já vem amarrado no catálogo real", () => {
    const t = criarTradutor("pt-BR");
    expect(t("vault.erro.nomeVazio")).toBe(PT_BR["vault.erro.nomeVazio"]);
  });
});
