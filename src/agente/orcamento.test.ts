// Doc 11 §12, item 7 (parcial): contagem, teto, formatação.
import { describe, it, expect } from "vitest";

import {
  usoVazio,
  somarUso,
  custoDaResposta,
  atingiuTeto,
  podeChamar,
  formatarTokens,
  formatarUso,
} from "./orcamento";

describe("orcamento", () => {
  it("somarUso acumula entrada e saída", () => {
    const a = somarUso(usoVazio(), { tokensEntrada: 10, tokensSaida: 2 });
    const b = somarUso(a, { tokensEntrada: 5, tokensSaida: 1 });
    expect(b).toEqual({ tokensEntrada: 15, tokensSaida: 3 });
  });

  it("custoDaResposta converte preço por milhão; sem preço verificado, null", () => {
    expect(
      custoDaResposta({ tokensEntrada: 1_000_000, tokensSaida: 500_000 }, { entrada: 2, saida: 8 }),
    ).toBeCloseTo(6);
    expect(custoDaResposta({ tokensEntrada: 100, tokensSaida: 10 }, undefined)).toBeNull();
  });

  it("sem teto configurado, podeChamar é sempre true (decisão 10.4)", () => {
    expect(podeChamar(999, null)).toBe(true);
    expect(podeChamar(null, 5)).toBe(true); // sem estimativa de custo, nada a dosar
  });

  it("teto atingido bloqueia novas chamadas", () => {
    expect(atingiuTeto(5, 5)).toBe(true);
    expect(atingiuTeto(5.1, 5)).toBe(true);
    expect(podeChamar(4.99, 5)).toBe(true);
  });

  it("formatarTokens em pt-BR", () => {
    expect(formatarTokens(940)).toBe("940");
    expect(formatarTokens(12400)).toBe("12,4 mil");
    expect(formatarTokens(1500000)).toBe("1,5 milhão");
  });

  it("formatarUso mostra custo quando existe estimativa, só tokens quando não", () => {
    const uso = { tokensEntrada: 11000, tokensSaida: 1400 };
    expect(formatarUso(uso, null)).toBe("12,4 mil tokens hoje");
    // preço verificado chega depois (doc 09, incerteza 26) — só o caminho formatado:
    const comCusto = formatarUso(uso, 0.03);
    expect(comCusto).toContain("12,4 mil tokens");
    expect(comCusto).toContain("US$");
  });
});
