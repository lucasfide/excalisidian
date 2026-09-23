// src/sync/diffLinhas.test.ts
import { performance } from "node:perf_hooks";

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

describe("diffLinhas com textos grandes — corte de prefixo/sufixo comuns", () => {
  it("5.000 linhas iguais com uma diferença no meio: só o miolo entra na tabela, e roda rápido", () => {
    const TOTAL = 5000;
    const MEIO = 2500;
    const linhas = Array.from({ length: TOTAL }, (_, i) => `linha ${i}`);
    const antes = linhas.join("\n");
    const depois = linhas
      .map((linha, i) => (i === MEIO ? "linha 2500 MODIFICADA" : linha))
      .join("\n");

    const inicio = performance.now();
    const trechos = diffLinhas(antes, depois);
    const duracaoMs = performance.now() - inicio;

    // 500ms é folgado para um miolo de 1 linha contra 1 linha; se o ambiente de CI for
    // muito mais lento que uma máquina de desenvolvimento, este número pode precisar subir,
    // mas qualquer coisa na casa dos segundos indica que o corte de prefixo/sufixo não
    // está funcionando (a tabela cheia de 5000×5000 é que levaria segundos).
    expect(duracaoMs).toBeLessThan(500);

    expect(trechos).toEqual([
      { tipo: "igual", linhas: linhas.slice(0, MEIO) },
      { tipo: "removido", linhas: ["linha 2500"] },
      { tipo: "adicionado", linhas: ["linha 2500 MODIFICADA"] },
      { tipo: "igual", linhas: linhas.slice(MEIO + 1) },
    ]);
  });

  it("dois textos grandes completamente diferentes estouram o teto: vira removido + adicionado em bloco", () => {
    const TOTAL = 2100; // 2100 × 2100 = 4.410.000 > LIMITE_CELULAS (4.000.000)
    const linhasAntes = Array.from({ length: TOTAL }, (_, i) => `a-linha-${i}`);
    const linhasDepois = Array.from({ length: TOTAL }, (_, i) => `b-linha-${i}`);

    const trechos = diffLinhas(linhasAntes.join("\n"), linhasDepois.join("\n"));

    expect(trechos).toEqual([
      { tipo: "removido", linhas: linhasAntes },
      { tipo: "adicionado", linhas: linhasDepois },
    ]);
  });

  it("teto de segurança vale mesmo com linhas iguais espalhadas no meio — sem isso, o LCS real acharia essas linhas e este teste distingue os dois comportamentos", () => {
    // Textos grandes o bastante para estourar LIMITE_CELULAS mesmo depois do corte de
    // prefixo/sufixo, mas com ALGUMAS linhas iguais em posições salteadas do meio — nem no
    // começo nem no fim, para o corte de prefixo/sufixo não alcançá-las. Sem o teto, o LCS
    // real encontraria essas linhas e produziria trechos "igual" no meio; com o teto, o
    // miolo inteiro vira um bloco removido+adicionado, ignorando a coincidência.
    const TOTAL = 2100; // 2100 × 2100 = 4.410.000 > LIMITE_CELULAS (4.000.000)
    const POSICOES_COMPARTILHADAS = new Set([300, 700, 1200, 1600, 1900]);
    const linhasAntes: string[] = [];
    const linhasDepois: string[] = [];
    for (let i = 0; i < TOTAL; i++) {
      if (POSICOES_COMPARTILHADAS.has(i)) {
        const linha = `linha-compartilhada-${i}`;
        linhasAntes.push(linha);
        linhasDepois.push(linha);
      } else {
        linhasAntes.push(`a-linha-${i}`);
        linhasDepois.push(`b-linha-${i}`);
      }
    }
    // Garante que o corte de prefixo/sufixo não alcança as linhas compartilhadas: a primeira
    // e a última linha de cada texto têm de diferir entre si.
    expect(linhasAntes[0]).not.toBe(linhasDepois[0]);
    expect(linhasAntes[TOTAL - 1]).not.toBe(linhasDepois[TOTAL - 1]);

    const trechos = diffLinhas(linhasAntes.join("\n"), linhasDepois.join("\n"));

    expect(trechos).toEqual([
      { tipo: "removido", linhas: linhasAntes },
      { tipo: "adicionado", linhas: linhasDepois },
    ]);
  });
});
