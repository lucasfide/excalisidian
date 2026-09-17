import { describe, it, expect } from "vitest";

import { analisarCor, converterMouseParaBuffer, RAMPA_CARACTERES } from "./asciiPeaksShader";

describe("analisarCor", () => {
  it("lê hex de 6 dígitos, maiúsculo ou minúsculo — o formato real dos tokens do app", () => {
    expect(analisarCor("#74419d")).toEqual([0x74 / 255, 0x41 / 255, 0x9d / 255]);
    expect(analisarCor("#AA85CB")).toEqual([0xaa / 255, 0x85 / 255, 0xcb / 255]);
  });

  it("aceita rgb()/rgba() como reforço", () => {
    expect(analisarCor("rgb(116, 65, 157)")).toEqual([116 / 255, 65 / 255, 157 / 255]);
    expect(analisarCor("rgba(255, 0, 0, 0.5)")).toEqual([1, 0, 0]);
  });

  it("devolve null pra formato que não reconhece (hsl, hex curto, lixo)", () => {
    expect(analisarCor("hsl(270, 41%, 43%)")).toBeNull();
    expect(analisarCor("#fff")).toBeNull();
    expect(analisarCor("")).toBeNull();
  });
});

describe("RAMPA_CARACTERES", () => {
  it("nunca fica vazia — o shader divide a luminância pela contagem dela", () => {
    expect(RAMPA_CARACTERES.length).toBeGreaterThan(1);
  });
});

describe("converterMouseParaBuffer", () => {
  it("aplica a mesma razão de escala que uTamanhoCelula (resolução interna reduzida)", () => {
    // canvas de 100px de cliente renderizando num buffer de 60px (FATOR_REDUCAO_RESOLUCAO):
    // escala 0.6, mouse no meio (50,50 em px de cliente) -> 30 em px de buffer no eixo X.
    const [x] = converterMouseParaBuffer(50, 50, 0.6, 60);
    expect(x).toBeCloseTo(30);
  });

  it("inverte o eixo Y — gl_FragCoord cresce de baixo pra cima, px de cliente de cima pra baixo", () => {
    // altura do buffer 60px, escala 1: mouse encostado no topo (yCliente=0) deve virar
    // yBuffer=60 (topo do espaço de gl_FragCoord); mouse embaixo (yCliente=60) vira yBuffer=0.
    expect(converterMouseParaBuffer(0, 0, 1, 60)[1]).toBe(60);
    expect(converterMouseParaBuffer(0, 60, 1, 60)[1]).toBe(0);
  });

  it("posição-sentinela bem longe da tela fica longe também no espaço do buffer", () => {
    const [x, y] = converterMouseParaBuffer(-9999, -9999, 0.6, 60);
    expect(x).toBeLessThan(-1000);
    expect(y).toBeGreaterThan(1000);
  });
});
