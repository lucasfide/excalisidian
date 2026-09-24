// src/sync/colunasComparacao.test.ts
import { describe, it, expect } from "vitest";

import { colunasDeComparacao } from "./colunasComparacao";
import { diffLinhas } from "./diffLinhas";

describe("colunasDeComparacao", () => {
  it("trecho igual aparece nas duas colunas, sem marcação", () => {
    expect(colunasDeComparacao([{ tipo: "igual", linhas: ["a", "b"] }])).toEqual([
      {
        esquerda: { texto: "a", marcada: false, preenchimento: false },
        direita: { texto: "a", marcada: false, preenchimento: false },
      },
      {
        esquerda: { texto: "b", marcada: false, preenchimento: false },
        direita: { texto: "b", marcada: false, preenchimento: false },
      },
    ]);
  });

  it("linha em branco de verdade (igual, texto vazio) não é preenchimento de alinhamento", () => {
    expect(colunasDeComparacao([{ tipo: "igual", linhas: [""] }])).toEqual([
      {
        esquerda: { texto: "", marcada: false, preenchimento: false },
        direita: { texto: "", marcada: false, preenchimento: false },
      },
    ]);
  });

  it("troca de 1 por 1: uma linha só na grade, as duas versões lado a lado", () => {
    const trechos = diffLinhas("a\nx\nc", "a\ny\nc");
    expect(colunasDeComparacao(trechos)).toEqual([
      {
        esquerda: { texto: "a", marcada: false, preenchimento: false },
        direita: { texto: "a", marcada: false, preenchimento: false },
      },
      {
        esquerda: { texto: "x", marcada: true, preenchimento: false },
        direita: { texto: "y", marcada: true, preenchimento: false },
      },
      {
        esquerda: { texto: "c", marcada: false, preenchimento: false },
        direita: { texto: "c", marcada: false, preenchimento: false },
      },
    ]);
  });

  it("3 removidas seguidas de 1 adicionada: a primeira pareia, as outras duas ficam com a direita em preenchimento", () => {
    const trechos: Parameters<typeof colunasDeComparacao>[0] = [
      { tipo: "removido", linhas: ["a", "b", "c"] },
      { tipo: "adicionado", linhas: ["x"] },
    ];
    expect(colunasDeComparacao(trechos)).toEqual([
      {
        esquerda: { texto: "a", marcada: true, preenchimento: false },
        direita: { texto: "x", marcada: true, preenchimento: false },
      },
      {
        esquerda: { texto: "b", marcada: true, preenchimento: false },
        direita: { texto: null, marcada: false, preenchimento: true },
      },
      {
        esquerda: { texto: "c", marcada: true, preenchimento: false },
        direita: { texto: null, marcada: false, preenchimento: true },
      },
    ]);
  });

  it("1 removida seguida de 3 adicionadas: a primeira pareia, as outras duas ficam com a esquerda em preenchimento", () => {
    const trechos: Parameters<typeof colunasDeComparacao>[0] = [
      { tipo: "removido", linhas: ["a"] },
      { tipo: "adicionado", linhas: ["x", "y", "z"] },
    ];
    expect(colunasDeComparacao(trechos)).toEqual([
      {
        esquerda: { texto: "a", marcada: true, preenchimento: false },
        direita: { texto: "x", marcada: true, preenchimento: false },
      },
      {
        esquerda: { texto: null, marcada: false, preenchimento: true },
        direita: { texto: "y", marcada: true, preenchimento: false },
      },
      {
        esquerda: { texto: null, marcada: false, preenchimento: true },
        direita: { texto: "z", marcada: true, preenchimento: false },
      },
    ]);
  });

  it("removido isolado (sem adicionado logo depois) aparece só na esquerda", () => {
    expect(colunasDeComparacao([{ tipo: "removido", linhas: ["x"] }])).toEqual([
      {
        esquerda: { texto: "x", marcada: true, preenchimento: false },
        direita: { texto: null, marcada: false, preenchimento: true },
      },
    ]);
  });

  it("adicionado isolado (sem removido antes) aparece só na direita", () => {
    expect(colunasDeComparacao([{ tipo: "adicionado", linhas: ["y"] }])).toEqual([
      {
        esquerda: { texto: null, marcada: false, preenchimento: true },
        direita: { texto: "y", marcada: true, preenchimento: false },
      },
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
      {
        esquerda: { texto: "a", marcada: true, preenchimento: false },
        direita: { texto: "x", marcada: true, preenchimento: false },
      },
      {
        esquerda: { texto: "m", marcada: false, preenchimento: false },
        direita: { texto: "m", marcada: false, preenchimento: false },
      },
      {
        esquerda: { texto: "b", marcada: true, preenchimento: false },
        direita: { texto: "y", marcada: true, preenchimento: false },
      },
    ]);
  });

  it("lista vazia de trechos dá lista vazia", () => {
    expect(colunasDeComparacao([])).toEqual([]);
  });
});
