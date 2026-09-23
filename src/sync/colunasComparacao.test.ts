// src/sync/colunasComparacao.test.ts
import { describe, it, expect } from "vitest";

import { colunasDeComparacao } from "./colunasComparacao";
import { diffLinhas } from "./diffLinhas";

describe("colunasDeComparacao", () => {
  it("trecho igual aparece nas duas colunas", () => {
    expect(colunasDeComparacao([{ tipo: "igual", linhas: ["a", "b"] }])).toEqual([
      { tipo: "igual", esquerda: "a", direita: "a" },
      { tipo: "igual", esquerda: "b", direita: "b" },
    ]);
  });

  it("trecho removido aparece só na esquerda", () => {
    expect(colunasDeComparacao([{ tipo: "removido", linhas: ["x"] }])).toEqual([
      { tipo: "removido", esquerda: "x", direita: null },
    ]);
  });

  it("trecho adicionado aparece só na direita", () => {
    expect(colunasDeComparacao([{ tipo: "adicionado", linhas: ["y"] }])).toEqual([
      { tipo: "adicionado", esquerda: null, direita: "y" },
    ]);
  });

  it("preserva a ordem dos trechos, linha a linha", () => {
    const trechos = diffLinhas("a\nx\nc", "a\ny\nc");
    expect(colunasDeComparacao(trechos)).toEqual([
      { tipo: "igual", esquerda: "a", direita: "a" },
      { tipo: "removido", esquerda: "x", direita: null },
      { tipo: "adicionado", esquerda: null, direita: "y" },
      { tipo: "igual", esquerda: "c", direita: "c" },
    ]);
  });

  it("lista vazia de trechos dá lista vazia", () => {
    expect(colunasDeComparacao([])).toEqual([]);
  });
});
