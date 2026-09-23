// src/sync/diffLinhas.test.ts
import { describe, it, expect } from "vitest";

import { diffLinhas, temDiferenca } from "./diffLinhas";

describe("diffLinhas", () => {
  it("textos iguais dão um trecho só", () => {
    expect(diffLinhas("a\nb", "a\nb")).toEqual([{ tipo: "igual", linhas: ["a", "b"] }]);
  });

  it("linha acrescentada no fim", () => {
    expect(diffLinhas("a", "a\nb")).toEqual([
      { tipo: "igual", linhas: ["a"] },
      { tipo: "adicionado", linhas: ["b"] },
    ]);
  });

  it("linha removida do fim", () => {
    expect(diffLinhas("a\nb", "a")).toEqual([
      { tipo: "igual", linhas: ["a"] },
      { tipo: "removido", linhas: ["b"] },
    ]);
  });

  it("linha trocada vira removido seguido de adicionado", () => {
    expect(diffLinhas("a\nx\nc", "a\ny\nc")).toEqual([
      { tipo: "igual", linhas: ["a"] },
      { tipo: "removido", linhas: ["x"] },
      { tipo: "adicionado", linhas: ["y"] },
      { tipo: "igual", linhas: ["c"] },
    ]);
  });

  it("linhas seguidas do mesmo tipo ficam num trecho só", () => {
    expect(diffLinhas("a", "a\nb\nc")).toEqual([
      { tipo: "igual", linhas: ["a"] },
      { tipo: "adicionado", linhas: ["b", "c"] },
    ]);
  });

  it("texto vazio de um lado dá tudo adicionado", () => {
    expect(diffLinhas("", "a\nb")).toEqual([{ tipo: "adicionado", linhas: ["a", "b"] }]);
  });

  it("os dois vazios não dão trecho nenhum", () => {
    expect(diffLinhas("", "")).toEqual([]);
  });

  it("CRLF e LF comparam igual — arquivo do Windows contra arquivo do Mac", () => {
    expect(temDiferenca(diffLinhas("a\r\nb", "a\nb"))).toBe(false);
  });

  it("trecho igual no meio é preservado, não reescrito", () => {
    const trechos = diffLinhas("x\nmeio\ny", "z\nmeio\nw");
    expect(trechos.some((t) => t.tipo === "igual" && t.linhas.includes("meio"))).toBe(true);
  });
});

describe("temDiferenca", () => {
  it("é falso quando tudo é igual", () => {
    expect(temDiferenca(diffLinhas("a\nb", "a\nb"))).toBe(false);
  });

  it("é verdadeiro com qualquer trecho diferente", () => {
    expect(temDiferenca(diffLinhas("a", "b"))).toBe(true);
  });
});
