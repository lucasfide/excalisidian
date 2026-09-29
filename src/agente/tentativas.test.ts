// Política de novas tentativas do segundo plano (doc 11 §5.0/§5.1): espera crescente por nota.
import { describe, it, expect } from "vitest";
import { ESPERAS_APOS_FALHA_MS, esperaAposFalha } from "./tentativas";

describe("esperaAposFalha", () => {
  it("lista de esperas: 5 s, 30 s, 2 min, 10 min", () => {
    expect(ESPERAS_APOS_FALHA_MS).toEqual([5_000, 30_000, 120_000, 600_000]);
  });

  it("a primeira falha espera 5 s", () => {
    expect(esperaAposFalha(1)).toBe(5_000);
  });

  it("cada falha seguinte pega a próxima espera", () => {
    expect(esperaAposFalha(2)).toBe(30_000);
    expect(esperaAposFalha(3)).toBe(120_000);
    expect(esperaAposFalha(4)).toBe(600_000);
  });

  it("depois da última espera desiste (null)", () => {
    expect(esperaAposFalha(5)).toBeNull();
    expect(esperaAposFalha(50)).toBeNull();
  });

  it("zero (defensivo) se comporta como a primeira falha", () => {
    expect(esperaAposFalha(0)).toBe(5_000);
  });
});
