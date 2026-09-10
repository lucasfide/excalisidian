import { describe, it, expect } from "vitest";
import { renormalizarSecao } from "./ordem";

describe("renormalizarSecao", () => {
  it("reatribui 10, 20, 30 na ordem dada", () => {
    expect(renormalizarSecao(["a", "b", "c"])).toEqual({ a: 10, b: 20, c: 30 });
  });
  it("lista vazia", () => {
    expect(renormalizarSecao([])).toEqual({});
  });
});
