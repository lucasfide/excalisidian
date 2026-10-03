import { describe, expect, it } from "vitest";
import {
  descreverPreco,
  economiaAnualPercentual,
  economiaAnualValor,
  equivalenteMensalDoAnual,
  formatarCreditos,
  formatarMoeda,
  moedaPorRegiao,
} from "./precos-planos";
import { linhasComparacao, maiorEconomiaAnual, menorPrecoMensalEquivalente, planos } from "../data/planos";

// Intl separa símbolo e número com espaço inseparável; os testes comparam com espaço comum.
const normalizar = (texto: string) => texto.replace(/ /g, " ");

describe("moeda pela região", () => {
  it.each([
    "America/Sao_Paulo",
    "America/Bahia",
    "America/Fortaleza",
    "America/Recife",
    "America/Maceio",
    "America/Belem",
    "America/Araguaina",
    "America/Santarem",
    "America/Manaus",
    "America/Cuiaba",
    "America/Campo_Grande",
    "America/Porto_Velho",
    "America/Boa_Vista",
    "America/Rio_Branco",
    "America/Eirunepe",
    "America/Noronha",
  ])("o fuso %s cobra em reais, mesmo com navegador em inglês", fuso => {
    expect(moedaPorRegiao(fuso, ["en-US"])).toBe("BRL");
  });

  it("fora do Brasil, algum idioma com região BR cobra em reais", () => {
    expect(moedaPorRegiao("Europe/Lisbon", ["en-US", "pt-BR"])).toBe("BRL");
    expect(moedaPorRegiao("America/New_York", ["en-BR"])).toBe("BRL");
    expect(moedaPorRegiao("", ["pt_br"])).toBe("BRL");
  });

  it("sem fuso nem região do Brasil, cobra em dólar", () => {
    expect(moedaPorRegiao("America/New_York", ["en-US"])).toBe("USD");
    expect(moedaPorRegiao("Europe/Lisbon", ["pt-PT", "pt"])).toBe("USD");
    expect(moedaPorRegiao("America/Argentina/Buenos_Aires", ["es-AR"])).toBe("USD");
    expect(moedaPorRegiao("", [])).toBe("USD");
    expect(moedaPorRegiao(null, [])).toBe("USD");
  });

  it("idioma pt sem região não basta: a região é que decide", () => {
    expect(moedaPorRegiao("Europe/Berlin", ["pt"])).toBe("USD");
  });
});

describe("formatação de moeda", () => {
  it("inteiros não levam centavos", () => {
    expect(normalizar(formatarMoeda(35, "BRL"))).toBe("R$ 35");
    expect(normalizar(formatarMoeda(8, "USD"))).toBe("US$ 8");
    expect(normalizar(formatarMoeda(0, "BRL"))).toBe("R$ 0");
  });

  it("não inteiros levam duas casas", () => {
    expect(normalizar(formatarMoeda(20.75, "BRL"))).toBe("R$ 20,75");
    expect(normalizar(formatarMoeda(4.92, "USD"))).toBe("US$ 4,92");
  });

  it("separa milhar", () => {
    expect(normalizar(formatarMoeda(1188, "BRL"))).toBe("R$ 1.188");
    expect(formatarCreditos(3000)).toBe("3.000");
  });
});

describe("equivalente mensal do anual", () => {
  it("é exato quando divide certo", () => {
    expect(equivalenteMensalDoAnual(249)).toBe(20.75);
  });

  it("arredonda para cima, nunca para baixo", () => {
    expect(equivalenteMensalDoAnual(59)).toBe(4.92);
    expect(equivalenteMensalDoAnual(149)).toBe(12.42);
    expect(equivalenteMensalDoAnual(779)).toBe(64.92);
    expect(equivalenteMensalDoAnual(59) * 12).toBeGreaterThanOrEqual(59);
  });
});

describe("economia do anual", () => {
  it("valor absoluto contra 12 meses no mensal", () => {
    expect(economiaAnualValor(8, 59)).toBe(37);
    expect(economiaAnualValor(35, 249)).toBe(171);
    expect(economiaAnualValor(18, 149)).toBe(67);
    expect(economiaAnualValor(99, 779)).toBe(409);
  });

  it("porcentagem arredondada para baixo", () => {
    expect(economiaAnualPercentual(8, 59)).toBe(38); // 38,54
    expect(economiaAnualPercentual(35, 249)).toBe(40); // 40,71
    expect(economiaAnualPercentual(18, 149)).toBe(31); // 31,01
    expect(economiaAnualPercentual(99, 779)).toBe(34); // 34,43
  });

  it("não promete economia onde não existe", () => {
    expect(economiaAnualPercentual(0, 0)).toBe(0);
    expect(economiaAnualValor(10, 200)).toBe(0);
    expect(economiaAnualPercentual(10, 200)).toBe(0);
  });
});

describe("preço exibido", () => {
  const marcoAurelio = planos.find(plano => plano.id === "marco-aurelio")!;
  const gratis = planos.find(plano => plano.id === "gratis")!;

  it("mensal mostra o valor mensal, sem total anual", () => {
    const preco = descreverPreco(marcoAurelio.precos.BRL, "BRL", "mensal");
    expect(normalizar(preco.valor)).toBe("R$ 35");
    expect(preco.totalAnual).toBeNull();
    expect(preco.economiaValor).toBeNull();
  });

  it("anual mostra o equivalente por mês e o total cobrado por ano", () => {
    const preco = descreverPreco(marcoAurelio.precos.BRL, "BRL", "anual");
    expect(normalizar(preco.valor)).toBe("R$ 20,75");
    expect(normalizar(preco.totalAnual ?? "")).toBe("R$ 249");
    expect(normalizar(preco.economiaValor ?? "")).toBe("R$ 171");
    expect(preco.economiaPercentual).toBe(40);
  });

  it("o Grátis é zero nos dois períodos, sem total nem economia", () => {
    for (const periodo of ["mensal", "anual"] as const) {
      const preco = descreverPreco(gratis.precos.USD, "USD", periodo);
      expect(normalizar(preco.valor)).toBe("US$ 0");
      expect(preco.totalAnual).toBeNull();
      expect(preco.economiaPercentual).toBeNull();
    }
  });
});

describe("dados dos planos", () => {
  it("tem os três planos, só um recomendado, e nenhum link de assinatura ainda", () => {
    expect(planos.map(plano => plano.nome)).toEqual(["Grátis", "Marco Aurélio", "Sêneca"]);
    expect(planos.filter(plano => plano.recomendado).map(plano => plano.nome)).toEqual(["Marco Aurélio"]);
    for (const plano of planos) {
      expect(plano.urlAssinatura).toEqual({ mensal: null, anual: null });
    }
  });

  it("menor preço mensal equivalente, por moeda, ignora o Grátis", () => {
    expect(menorPrecoMensalEquivalente("BRL")).toBe(20.75);
    expect(menorPrecoMensalEquivalente("USD")).toBe(4.92);
  });

  it("maior economia anual, por moeda", () => {
    expect(maiorEconomiaAnual("BRL")).toBe(409);
    expect(maiorEconomiaAnual("USD")).toBe(67);
  });

  it("a tabela de comparação tem uma célula para cada plano em toda linha", () => {
    for (const linha of linhasComparacao) {
      expect(Object.keys(linha.valores).sort()).toEqual(["gratis", "marco-aurelio", "seneca"]);
    }
    const creditos = linhasComparacao.find(linha => linha.id === "creditos");
    expect(creditos?.valores["marco-aurelio"]).toBe("3.000");
    expect(creditos?.valores.seneca).toBe("10.000");
  });
});
