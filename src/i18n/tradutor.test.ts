// src/i18n/tradutor.test.ts
import { describe, it, expect } from "vitest";

import { criarTradutorDe, interpolar } from "./tradutor";
import type { Idioma } from "./idioma";

const CATALOGOS: Record<Idioma, Record<string, string>> = {
  "pt-BR": {
    "teste.simples": "Salvar nota",
    "teste.comParam": "{contagem} notas em {pasta}",
    "teste.soEmPortugues": "Ainda sem tradução",
  },
  en: {
    "teste.simples": "Save note",
    "teste.comParam": "{contagem} notes in {pasta}",
  },
};

describe("interpolar", () => {
  it("troca cada marcador pelo parâmetro", () => {
    expect(interpolar("{a} e {b}", { a: "um", b: "dois" })).toBe("um e dois");
  });

  it("aceita número e converte", () => {
    expect(interpolar("{n} itens", { n: 3 })).toBe("3 itens");
  });

  it("o mesmo marcador repetido é trocado nas duas ocorrências", () => {
    expect(interpolar("{x}-{x}", { x: "a" })).toBe("a-a");
  });

  it("marcador sem parâmetro fica literal, para o buraco aparecer na tela", () => {
    expect(interpolar("{a} e {b}", { a: "um" })).toBe("um e {b}");
  });

  it("texto sem marcador passa intacto", () => {
    expect(interpolar("Salvar nota", { a: "x" })).toBe("Salvar nota");
  });
});

describe("criarTradutorDe", () => {
  it("devolve o texto do idioma pedido", () => {
    const t = criarTradutorDe(CATALOGOS, "en");
    expect(t("teste.simples")).toBe("Save note");
  });

  it("interpola no idioma pedido", () => {
    const t = criarTradutorDe(CATALOGOS, "en");
    expect(t("teste.comParam", { contagem: 2, pasta: "Inbox" })).toBe("2 notes in Inbox");
  });

  it("chave sem tradução cai no português, nunca na chave crua", () => {
    const t = criarTradutorDe(CATALOGOS, "en");
    expect(t("teste.soEmPortugues")).toBe("Ainda sem tradução");
  });

  it("chave inexistente devolve a própria chave, para o erro ficar visível", () => {
    const t = criarTradutorDe(CATALOGOS, "pt-BR");
    expect(t("teste.naoExiste")).toBe("teste.naoExiste");
  });

  it("em português não consulta o inglês", () => {
    const t = criarTradutorDe(CATALOGOS, "pt-BR");
    expect(t("teste.simples")).toBe("Salvar nota");
  });
});
