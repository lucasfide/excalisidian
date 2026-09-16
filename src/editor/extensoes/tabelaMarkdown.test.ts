import { describe, it, expect } from "vitest";

import { linhaViraTabela, linhaEhDelimitadora } from "./tabelaMarkdown";

describe("linhaViraTabela", () => {
  it("linha simples de 2 células vira tabela", () => {
    expect(linhaViraTabela("| a | b |")).toEqual(["a", "b"]);
  });

  it("mais de 2 células também casa", () => {
    expect(linhaViraTabela("| a | b | c |")).toEqual(["a", "b", "c"]);
  });

  it("apara espaço de cada célula", () => {
    expect(linhaViraTabela("|  a  |  b  |")).toEqual(["a", "b"]);
  });

  it("apara espaço em volta da linha inteira antes de checar as pontas", () => {
    expect(linhaViraTabela("  | a | b |  ")).toEqual(["a", "b"]);
  });

  it("só 1 célula não casa (doc 14: pelo menos 2)", () => {
    expect(linhaViraTabela("| a |")).toBeNull();
  });

  it("sem pipe nenhum não casa", () => {
    expect(linhaViraTabela("a e b")).toBeNull();
  });

  it("não começa com pipe não casa, mesmo com pipe no meio e no fim", () => {
    expect(linhaViraTabela("a | b |")).toBeNull();
  });

  it("não termina com pipe não casa", () => {
    expect(linhaViraTabela("| a | b")).toBeNull();
  });

  it("célula vazia conta (ex.: '| a |  |')", () => {
    expect(linhaViraTabela("| a |  |")).toEqual(["a", ""]);
  });

  it("pipe escapado dentro da célula não separa célula", () => {
    expect(linhaViraTabela("| a \\| ainda a | b |")).toEqual(["a \\| ainda a", "b"]);
  });

  it("string vazia não casa", () => {
    expect(linhaViraTabela("")).toBeNull();
  });
});

describe("linhaEhDelimitadora", () => {
  it("delimitadora com pipes nas pontas", () => {
    expect(linhaEhDelimitadora("| --- | --- |")).toBe(true);
  });

  it("delimitadora sem pipes nas pontas", () => {
    expect(linhaEhDelimitadora("--- | ---")).toBe(true);
  });

  it("delimitadora com alinhamento (: nas pontas do hífen)", () => {
    expect(linhaEhDelimitadora("| :--- | :---: | ---: |")).toBe(true);
  });

  it("linha de cabeçalho normal não é delimitadora", () => {
    expect(linhaEhDelimitadora("| a | b |")).toBe(false);
  });

  it("linha vazia não é delimitadora", () => {
    expect(linhaEhDelimitadora("")).toBe(false);
  });

  it("texto qualquer com hífen não é delimitadora", () => {
    expect(linhaEhDelimitadora("um texto - com hífen")).toBe(false);
  });
});
