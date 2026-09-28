// servidor/src/creditosIa.test.ts
// Créditos da IA (doc 18 §5.2): preço por faixa de horário, custo em micro-dólares inteiros,
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
  ehHorarioDePico,
  periodoDe,
  renovaEmDe,
  saldoDaConta,
} from "./creditosIa";

// 28/09/2026 é segunda-feira.
const SEGUNDA_12H_UTC = Date.UTC(2026, 8, 28, 12, 0, 0);
const SEGUNDA_02H_UTC = Date.UTC(2026, 8, 28, 2, 0, 0);
const SEGUNDA_07H_UTC = Date.UTC(2026, 8, 28, 7, 30, 0);
const SEGUNDA_04H_UTC = Date.UTC(2026, 8, 28, 4, 0, 0);
const SABADO_02H_UTC = Date.UTC(2026, 8, 26, 2, 0, 0);

describe("ehHorarioDePico", () => {
  it("é pico de segunda a sexta entre 01h e 04h e entre 06h e 10h UTC", () => {
    expect(ehHorarioDePico(SEGUNDA_02H_UTC)).toBe(true);
    expect(ehHorarioDePico(SEGUNDA_07H_UTC)).toBe(true);
  });

  it("04:00 em ponto já é fora de pico, e meio-dia também", () => {
    expect(ehHorarioDePico(SEGUNDA_04H_UTC)).toBe(false);
    expect(ehHorarioDePico(SEGUNDA_12H_UTC)).toBe(false);
  });

  it("fim de semana nunca é pico", () => {
    expect(ehHorarioDePico(SABADO_02H_UTC)).toBe(false);
  });
});

describe("custoMicroUsd", () => {
  it("fora de pico: 1000 sem cache + 1000 com cache + 100 de saída", () => {
    // 1000*0,15 + 1000*0,003 + 100*0,60 = 150 + 3 + 60 = 213 micro-dólares
    expect(
      custoMicroUsd({ entradaSemCache: 1000, entradaComCache: 1000, saida: 100 }, SEGUNDA_12H_UTC),
    ).toBe(213);
  });

  it("no pico custa o dobro", () => {
    expect(
      custoMicroUsd({ entradaSemCache: 1000, entradaComCache: 1000, saida: 100 }, SEGUNDA_02H_UTC),
    ).toBe(426);
  });

  it("arredonda para cima, nunca para baixo", () => {
    // 1 token com cache fora de pico = 0,003 micro-dólar → 1
    expect(custoMicroUsd({ entradaSemCache: 0, entradaComCache: 1, saida: 0 }, SEGUNDA_12H_UTC)).toBe(1);
  });

  it("não sofre erro de ponto flutuante (1000 tokens sem cache = 150 exatos)", () => {
    expect(custoMicroUsd({ entradaSemCache: 1000, entradaComCache: 0, saida: 0 }, SEGUNDA_12H_UTC)).toBe(150);
  });

  it("uso zero custa zero", () => {
    expect(custoMicroUsd({ entradaSemCache: 0, entradaComCache: 0, saida: 0 }, SEGUNDA_12H_UTC)).toBe(0);
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
    debitar(banco, contaId, SEGUNDA_12H_UTC, { entradaSemCache: 10_000, entradaComCache: 0, saida: 0 }); // 1500 µ$
    debitar(banco, contaId, SEGUNDA_12H_UTC, { entradaSemCache: 0, entradaComCache: 0, saida: 1000 }); // 600 µ$
    const linha = banco
      .prepare(`select custo_micro_usd, pedidos, tokens_entrada, tokens_saida from uso_ia where conta_id = ?`)
      .get(contaId);
    expect(linha).toEqual({ custo_micro_usd: 2100, pedidos: 2, tokens_entrada: 10_000, tokens_saida: 1000 });
    expect(saldoDaConta(banco, contaId, SEGUNDA_12H_UTC).usados).toBe(3); // teto(2100/1000)
  });

  it("uso de um mês não conta no mês seguinte", () => {
    debitar(banco, contaId, SEGUNDA_12H_UTC, { entradaSemCache: 10_000, entradaComCache: 0, saida: 0 });
    expect(saldoDaConta(banco, contaId, Date.UTC(2026, 9, 5, 12, 0, 0)).usados).toBe(0);
  });

  it("debitar devolve o custo do pedido em micro-dólares", () => {
    expect(debitar(banco, contaId, SEGUNDA_12H_UTC, { entradaSemCache: 1000, entradaComCache: 0, saida: 0 })).toBe(150);
  });
});
