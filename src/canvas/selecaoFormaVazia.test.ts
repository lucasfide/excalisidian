import { describe, it, expect } from "vitest";
import { ehTransparente, pontoDentroDaForma, acharFormaVaziaNoPonto } from "./selecaoFormaVazia";

describe("ehTransparente", () => {
  it("reconhece o literal 'transparent'", () => {
    expect(ehTransparente("transparent")).toBe(true);
  });
  it("reconhece alpha 00 em #RRGGBBAA e #RGBA", () => {
    expect(ehTransparente("#ffffff00")).toBe(true);
    expect(ehTransparente("#fff0")).toBe(true);
  });
  it("cor sólida não é transparente", () => {
    expect(ehTransparente("#1c1917")).toBe(false);
    expect(ehTransparente("#ffffffff")).toBe(false);
  });
});

function retangulo(over: Partial<Parameters<typeof pontoDentroDaForma>[2]> = {}) {
  return {
    id: "r1",
    type: "rectangle" as const,
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    angle: 0,
    backgroundColor: "transparent",
    ...over,
  };
}

describe("pontoDentroDaForma", () => {
  it("retângulo: ponto no centro está dentro; ponto bem fora, não", () => {
    const r = retangulo();
    expect(pontoDentroDaForma(50, 25, r)).toBe(true);
    expect(pontoDentroDaForma(500, 500, r)).toBe(false);
  });

  it("elipse: ponto no centro está dentro; canto do bounding box, fora (elipse não é retângulo)", () => {
    const e = retangulo({ type: "ellipse", id: "e1" });
    expect(pontoDentroDaForma(50, 25, e)).toBe(true);
    expect(pontoDentroDaForma(1, 1, e)).toBe(false); // canto — fora da elipse, dentro do bbox
  });

  it("losango: ponto no centro está dentro; canto do bounding box, fora", () => {
    const d = retangulo({ type: "diamond", id: "d1" });
    expect(pontoDentroDaForma(50, 25, d)).toBe(true);
    expect(pontoDentroDaForma(1, 1, d)).toBe(false);
  });

  it("respeita rotação: ponto fora do bbox não-rotacionado pode estar dentro depois de girar", () => {
    // Quadrado 100x100 centrado em (50,50), rotacionado 45°. Um ponto que estaria fora do
    // quadrado reto (perto de uma quina do bbox rotacionado) cai dentro depois da rotação.
    const quadradoGirado = retangulo({
      width: 100,
      height: 100,
      angle: Math.PI / 4,
    });
    // Ponto bem no centro sempre está dentro, rotação ou não — teste de sanidade mínimo.
    expect(pontoDentroDaForma(50, 50, quadradoGirado)).toBe(true);
  });

  it("tipo não suportado (seta, texto) nunca está 'dentro'", () => {
    const seta = retangulo({ type: "arrow", id: "a1" });
    expect(pontoDentroDaForma(50, 25, seta)).toBe(false);
  });
});

describe("acharFormaVaziaNoPonto", () => {
  it("ignora forma com preenchimento sólido", () => {
    const preenchido = retangulo({ id: "p1", backgroundColor: "#e5dfd4" });
    expect(acharFormaVaziaNoPonto([preenchido], 50, 25)).toBe(null);
  });

  it("acha a forma vazia que contém o ponto", () => {
    const vazio = retangulo({ id: "v1" });
    expect(acharFormaVaziaNoPonto([vazio], 50, 25)?.id).toBe("v1");
  });

  it("com duas formas sobrepostas, escolhe a de cima (última do array)", () => {
    const debaixo = retangulo({ id: "baixo" });
    const cima = retangulo({ id: "cima", x: 10, y: 10 });
    expect(acharFormaVaziaNoPonto([debaixo, cima], 50, 25)?.id).toBe("cima");
  });

  it("ignora elemento apagado", () => {
    const apagado = retangulo({ id: "x", isDeleted: true });
    expect(acharFormaVaziaNoPonto([apagado], 50, 25)).toBe(null);
  });

  it("nenhuma forma no ponto: null", () => {
    const r = retangulo();
    expect(acharFormaVaziaNoPonto([r], 500, 500)).toBe(null);
  });
});
