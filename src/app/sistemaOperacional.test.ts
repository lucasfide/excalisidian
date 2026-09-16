import { describe, it, expect } from "vitest";
import { primeiroNomeDe, saudacaoPorHorario } from "./sistemaOperacional";

describe("saudacaoPorHorario", () => {
  it("madrugada é boa noite", () => {
    expect(saudacaoPorHorario(3)).toBe("Boa noite");
  });
  it("manhã é bom dia", () => {
    expect(saudacaoPorHorario(9)).toBe("Bom dia");
  });
  it("meio-dia em diante é boa tarde", () => {
    expect(saudacaoPorHorario(12)).toBe("Boa tarde");
    expect(saudacaoPorHorario(17)).toBe("Boa tarde");
  });
  it("noite é boa noite", () => {
    expect(saudacaoPorHorario(18)).toBe("Boa noite");
    expect(saudacaoPorHorario(23)).toBe("Boa noite");
  });
});

describe("primeiroNomeDe", () => {
  it("USERNAME do Windows concatenado sem separador: corta na fronteira camelCase", () => {
    expect(primeiroNomeDe("LucasFidelisdeCristo")).toBe("Lucas");
  });

  it("separa por ponto", () => {
    expect(primeiroNomeDe("lucas.fidelis")).toBe("Lucas");
  });

  it("tudo maiúsculo separado por underscore: sem fronteira camelCase, corta no underscore", () => {
    expect(primeiroNomeDe("MARIA_SILVA")).toBe("Maria");
  });

  it("acento é preservado e recapitalizado em pt-BR", () => {
    expect(primeiroNomeDe("joão")).toBe("João");
  });

  it("string vazia devolve string vazia", () => {
    expect(primeiroNomeDe("")).toBe("");
  });

  it("letra minúscula isolada seguida de maiúscula conta como fronteira: 'jSmith' vira 'J'", () => {
    // Decisão: a mesma regra de fronteira camelCase que separa "LucasFidelisdeCristo" também
    // separa "jSmith" em "j" + "Smith" — não há como distinguir "inicial + sobrenome" de
    // "nome concatenado" só olhando o texto, e tratar igual é mais previsível (mesma regra,
    // sem caso especial pro comprimento do primeiro pedaço) do que adivinhar que um pedaço de
    // 1 letra deve ser descartado.
    expect(primeiroNomeDe("jSmith")).toBe("J");
  });

  it("maiúscula acentuada no início não quebra a fronteira camelCase", () => {
    expect(primeiroNomeDe("ÁlvaroGomes")).toBe("Álvaro");
  });

  it("separa por hífen e por espaço", () => {
    expect(primeiroNomeDe("ana-carolina")).toBe("Ana");
    expect(primeiroNomeDe("  Pedro Alves  ")).toBe("Pedro");
  });
});
