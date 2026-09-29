// servidor/src/creditosIa.test.ts
// Créditos da IA (doc 18 §5.2): custo em micro-dólares inteiros (informado pelo fornecedor ou pelo teto de preço),
// mês civil de Brasília, saldo e débito no SQLite.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { abrirBanco, type BancoSqlite } from "./banco";
import {
  COTA_POR_FAIXA,
  creditosDeMicroUsd,
  custoMicroUsd,
  debitar,
  periodoDe,
  renovaEmDe,
  saldoDaConta,
} from "./creditosIa";

// 28/09/2026 é segunda-feira.
const SEGUNDA_12H_UTC = Date.UTC(2026, 8, 28, 12, 0, 0);

describe("custoMicroUsd", () => {
  it("custo informado 0,000123 US$ → 130 µ$ (123 × 1,055 arredondado para cima)", () => {
    expect(custoMicroUsd({ entradaSemCache: 1000, entradaComCache: 0, saida: 100 }, 0.000123)).toBe(130);
  });

  it("custo informado 0 → 0", () => {
    expect(custoMicroUsd({ entradaSemCache: 1000, entradaComCache: 0, saida: 100 }, 0)).toBe(0);
  });

  it("sem custo: cobra pelo teto de preço, sem desconto de cache (500+500 entrada, 100 saída → 444 µ$)", () => {
    // nano = 1000*300 + 100*1200 = 420000; × 1,055 = 443100 nano → 444 µ$
    expect(custoMicroUsd({ entradaSemCache: 500, entradaComCache: 500, saida: 100 })).toBe(444);
  });

  it("custo inválido (NaN, negativo, infinito) cai no teto", () => {
    const uso = { entradaSemCache: 500, entradaComCache: 500, saida: 100 };
    expect(custoMicroUsd(uso, Number.NaN)).toBe(444);
    expect(custoMicroUsd(uso, -1)).toBe(444);
    expect(custoMicroUsd(uso, Number.POSITIVE_INFINITY)).toBe(444);
  });

  it("uso zero sem custo custa zero", () => {
    expect(custoMicroUsd({ entradaSemCache: 0, entradaComCache: 0, saida: 0 })).toBe(0);
  });
});

describe("período (mês civil de Brasília)", () => {
  it("dia 1º às 01:00 UTC ainda é o mês anterior em Brasília (dia 31 às 22:00)", () => {
    expect(periodoDe(Date.UTC(2026, 9, 1, 1, 0, 0))).toBe("2026-09");
  });

  it("dia 1º às 03:00 UTC (meia-noite em Brasília) já é o mês novo", () => {
    expect(periodoDe(Date.UTC(2026, 9, 1, 3, 0, 0))).toBe("2026-10");
  });

  it("renovaEm é meia-noite de Brasília do dia 1º do mês seguinte", () => {
    expect(renovaEmDe(SEGUNDA_12H_UTC)).toBe(Date.UTC(2026, 9, 1, 3, 0, 0));
  });

  it("em dezembro renova em janeiro do ano seguinte", () => {
    expect(renovaEmDe(Date.UTC(2026, 11, 15, 12, 0, 0))).toBe(Date.UTC(2027, 0, 1, 3, 0, 0));
    expect(periodoDe(Date.UTC(2026, 11, 15, 12, 0, 0))).toBe("2026-12");
  });
});

describe("creditosDeMicroUsd", () => {
  it("1000 micro-dólares = 1 crédito; qualquer fração conta como crédito inteiro", () => {
    expect(creditosDeMicroUsd(0)).toBe(0);
    expect(creditosDeMicroUsd(1000)).toBe(1);
    expect(creditosDeMicroUsd(1001)).toBe(2);
  });
});

describe("saldo e débito no banco", () => {
  let pasta: string;
  let banco: BancoSqlite;
  let contaId: number;

  beforeEach(() => {
    pasta = fs.mkdtempSync(path.join(os.tmpdir(), "excalisidian-creditos-"));
    banco = abrirBanco(pasta);
    const r = banco
      .prepare(`insert into contas (email, sal, hash, plano, criada_em) values (?, x'00', x'00', 'premium', 0)`)
      .run("a@exemplo.com");
    contaId = Number(r.lastInsertRowid);
  });

  afterEach(() => {
    banco.close();
    fs.rmSync(pasta, { recursive: true, force: true });
  });

  it("conta nova nasce na faixa padrão, sem uso", () => {
    expect(saldoDaConta(banco, contaId, SEGUNDA_12H_UTC)).toEqual({
      usados: 0,
      total: COTA_POR_FAIXA.padrao,
      renovaEm: Date.UTC(2026, 9, 1, 3, 0, 0),
    });
  });

  it("faixa superior tem 10.000 créditos", () => {
    banco.prepare(`update contas set faixa_ia = 'superior' where id = ?`).run(contaId);
    expect(saldoDaConta(banco, contaId, SEGUNDA_12H_UTC).total).toBe(10_000);
  });

  it("debitar acumula custo, pedidos e tokens no mês", () => {
    debitar(banco, contaId, SEGUNDA_12H_UTC, { entradaSemCache: 10_000, entradaComCache: 0, saida: 0 }, 0.001); // 1055 µ$
    debitar(banco, contaId, SEGUNDA_12H_UTC, { entradaSemCache: 0, entradaComCache: 0, saida: 1000 }, 0.0005); // 528 µ$
    const linha = banco
      .prepare(`select custo_micro_usd, pedidos, tokens_entrada, tokens_saida from uso_ia where conta_id = ?`)
      .get(contaId);
    expect(linha).toEqual({ custo_micro_usd: 1583, pedidos: 2, tokens_entrada: 10_000, tokens_saida: 1000 });
    expect(saldoDaConta(banco, contaId, SEGUNDA_12H_UTC).usados).toBe(2); // teto(1583/1000)
  });

  it("uso de um mês não conta no mês seguinte", () => {
    debitar(banco, contaId, SEGUNDA_12H_UTC, { entradaSemCache: 10_000, entradaComCache: 0, saida: 0 });
    expect(saldoDaConta(banco, contaId, Date.UTC(2026, 9, 5, 12, 0, 0)).usados).toBe(0);
  });

  it("debitar devolve o custo do pedido em micro-dólares (informado ou pelo teto)", () => {
    expect(debitar(banco, contaId, SEGUNDA_12H_UTC, { entradaSemCache: 1000, entradaComCache: 0, saida: 0 }, 0.0001)).toBe(106);
    expect(debitar(banco, contaId, SEGUNDA_12H_UTC, { entradaSemCache: 1000, entradaComCache: 0, saida: 0 })).toBe(317);
  });
});
