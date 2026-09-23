// src/sync/colunasComparacao.test.ts
import { describe, it, expect } from "vitest";

import { colunasDeComparacao } from "./colunasComparacao";
import { diffLinhas } from "./diffLinhas";

describe("colunasDeComparacao", () => {
  it("trecho igual aparece nas duas colunas, sem marcação", () => {
    expect(colunasDeComparacao([{ tipo: "igual", linhas: ["a", "b"] }])).toEqual([
      { esquerda: { texto: "a", marcada: false }, direita: { texto: "a", marcada: false } },
      { esquerda: { texto: "b", marcada: false }, direita: { texto: "b", marcada: false } },
    ]);
  });

  it("troca de 1 por 1: uma linha só na grade, as duas versões lado a lado", () => {
    const trechos = diffLinhas("a\nx\nc", "a\ny\nc");
    expect(colunasDeComparacao(trechos)).toEqual([
      { esquerda: { texto: "a", marcada: false }, direita: { texto: "a", marcada: false } },
      { esquerda: { texto: "x", marcada: true }, direita: { texto: "y", marcada: true } },
      { esquerda: { texto: "c", marcada: false }, direita: { texto: "c", marcada: false } },
    ]);
  });

  it("3 removidas seguidas de 1 adicionada: a primeira pareia, as outras duas ficam com a direita em branco", () => {
    const trechos: Parameters<typeof colunasDeComparacao>[0] = [
      { tipo: "removido", linhas: ["a", "b", "c"] },
      { tipo: "adicionado", linhas: ["x"] },
    ];
    expect(colunasDeComparacao(trechos)).toEqual([
      { esquerda: { texto: "a", marcada: true }, direita: { texto: "x", marcada: true } },
      { esquerda: { texto: "b", marcada: true }, direita: { texto: null, marcada: false } },
      { esquerda: { texto: "c", marcada: true }, direita: { texto: null, marcada: false } },
    ]);
  });

  it("1 removida seguida de 3 adicionadas: a primeira pareia, as outras duas ficam com a esquerda em branco", () => {
    const trechos: Parameters<typeof colunasDeComparacao>[0] = [
      { tipo: "removido", linhas: ["a"] },
      { tipo: "adicionado", linhas: ["x", "y", "z"] },
    ];
    expect(colunasDeComparacao(trechos)).toEqual([
      { esquerda: { texto: "a", marcada: true }, direita: { texto: "x", marcada: true } },
      { esquerda: { texto: null, marcada: false }, direita: { texto: "y", marcada: true } },
      { esquerda: { texto: null, marcada: false }, direita: { texto: "z", marcada: true } },
    ]);
  });

  it("removido isolado (sem adicionado logo depois) aparece só na esquerda", () => {
    expect(colunasDeComparacao([{ tipo: "removido", linhas: ["x"] }])).toEqual([
      { esquerda: { texto: "x", marcada: true }, direita: { texto: null, marcada: false } },
    ]);
  });

  it("adicionado isolado (sem removido antes) aparece só na direita", () => {
    expect(colunasDeComparacao([{ tipo: "adicionado", linhas: ["y"] }])).toEqual([
      { esquerda: { texto: null, marcada: false }, direita: { texto: "y", marcada: true } },
    ]);
  });

  it("igual entre duas trocas não se mistura com elas", () => {
    const trechos: Parameters<typeof colunasDeComparacao>[0] = [
      { tipo: "removido", linhas: ["a"] },
      { tipo: "adicionado", linhas: ["x"] },
      { tipo: "igual", linhas: ["m"] },
      { tipo: "removido", linhas: ["b"] },
      { tipo: "adicionado", linhas: ["y"] },
    ];
    expect(colunasDeComparacao(trechos)).toEqual([
      { esquerda: { texto: "a", marcada: true }, direita: { texto: "x", marcada: true } },
      { esquerda: { texto: "m", marcada: false }, direita: { texto: "m", marcada: false } },
      { esquerda: { texto: "b", marcada: true }, direita: { texto: "y", marcada: true } },
    ]);
  });

  it("lista vazia de trechos dá lista vazia", () => {
    expect(colunasDeComparacao([])).toEqual([]);
  });
});
