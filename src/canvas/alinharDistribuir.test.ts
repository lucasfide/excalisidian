import { describe, it, expect } from "vitest";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import { boundingBoxRotacionado, alinhar, distribuir } from "./alinharDistribuir";

function mockElemento(
  parcial: Partial<ExcalidrawElement> & { id: string; type: string },
): ExcalidrawElement {
  return {
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    angle: 0,
    strokeColor: "#000000",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: 1,
    version: 1,
    versionNonce: 1,
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
    ...parcial,
  } as unknown as ExcalidrawElement;
}

function sel(...ids: string[]): Record<string, boolean> {
  return Object.fromEntries(ids.map((id) => [id, true]));
}

describe("boundingBoxRotacionado", () => {
  it("sem rotação, é x/y/width/height cru", () => {
    const el = mockElemento({ id: "a", type: "rectangle", x: 10, y: 20, width: 40, height: 30 });
    expect(boundingBoxRotacionado(el)).toEqual({ minX: 10, minY: 20, maxX: 50, maxY: 50 });
  });

  it("rotação de 90° troca largura e altura em torno do centro", () => {
    const el = mockElemento({
      id: "a",
      type: "rectangle",
      x: 0,
      y: 0,
      width: 40,
      height: 20,
      angle: Math.PI / 2,
    });
    // centro em (20, 10); girado 90°, a caixa vira 20 de largura por 40 de altura
    const bb = boundingBoxRotacionado(el);
    expect(bb.minX).toBeCloseTo(10);
    expect(bb.maxX).toBeCloseTo(30);
    expect(bb.minY).toBeCloseTo(-10);
    expect(bb.maxY).toBeCloseTo(30);
  });
});

describe("alinhar", () => {
  it("esquerda: todos ficam com a borda esquerda igual à mais à esquerda do grupo", () => {
    const a = mockElemento({ id: "a", type: "rectangle", x: 0, y: 0, width: 50, height: 50 });
    const b = mockElemento({ id: "b", type: "rectangle", x: 100, y: 200, width: 20, height: 20 });
    const r = alinhar([a, b], sel("a", "b"), "esquerda");
    expect(r.find((e) => e.id === "a")!.x).toBe(0);
    expect(r.find((e) => e.id === "b")!.x).toBe(0);
    // eixo Y não é tocado por um alinhamento horizontal
    expect(r.find((e) => e.id === "b")!.y).toBe(200);
  });

  it("direita: todos ficam com a borda direita igual à mais à direita do grupo", () => {
    const a = mockElemento({ id: "a", type: "rectangle", x: 0, y: 0, width: 50, height: 50 });
    const b = mockElemento({ id: "b", type: "rectangle", x: 200, y: 0, width: 20, height: 20 });
    const r = alinhar([a, b], sel("a", "b"), "direita");
    // borda direita comum = max(50, 220) = 220
    expect(r.find((e) => e.id === "a")!.x).toBe(170); // 220 - 50
    expect(r.find((e) => e.id === "b")!.x).toBe(200); // já estava lá
  });

  it("centroH: centraliza os dois no centro horizontal combinado", () => {
    const a = mockElemento({ id: "a", type: "rectangle", x: 0, y: 0, width: 100, height: 10 });
    const b = mockElemento({ id: "b", type: "rectangle", x: 200, y: 0, width: 100, height: 10 });
    // bbox combinado: minX=0, maxX=300, centro=150
    const r = alinhar([a, b], sel("a", "b"), "centroH");
    expect(r.find((e) => e.id === "a")!.x).toBe(100); // centro do elemento (x+50) = 150
    expect(r.find((e) => e.id === "b")!.x).toBe(100);
  });

  it("topo/centroV/base: equivalentes no eixo Y", () => {
    const a = mockElemento({ id: "a", type: "rectangle", x: 0, y: 0, width: 10, height: 50 });
    const b = mockElemento({ id: "b", type: "rectangle", x: 0, y: 200, width: 10, height: 20 });

    expect(alinhar([a, b], sel("a", "b"), "topo").find((e) => e.id === "b")!.y).toBe(0);
    expect(alinhar([a, b], sel("a", "b"), "base").find((e) => e.id === "a")!.y).toBe(170); // 220-50
  });

  it("considera a rotação: um elemento rotacionado 90° alinha pela borda visual, não x/width crus", () => {
    // b é um retângulo 40x20 rotacionado 90° em torno do próprio centro (20,10) — a borda
    // esquerda VISUAL dele (bounding box rotacionado) fica em x=10, não em x=0 (cru). a tem
    // borda esquerda em x=5 — mais à esquerda que a borda visual de b (10), mas MAIS À DIREITA
    // que a borda crua de b (0). Se o código ignorasse a rotação e usasse x/width crus, "a"
    // seria julgado o mais à direita e se moveria; usando a bounding box de verdade, "a" já é o
    // mais à esquerda do grupo e não deveria se mover nada.
    const a = mockElemento({ id: "a", type: "rectangle", x: 5, y: 0, width: 1, height: 1 });
    const b = mockElemento({
      id: "b",
      type: "rectangle",
      x: 0,
      y: 0,
      width: 40,
      height: 20,
      angle: Math.PI / 2,
    });
    const r = alinhar([a, b], sel("a", "b"), "esquerda");
    expect(r.find((e) => e.id === "a")!.x).toBe(5); // não se move: já era o mais à esquerda
    const bAlinhado = r.find((e) => e.id === "b")!;
    expect(boundingBoxRotacionado(bAlinhado).minX).toBeCloseTo(5);
  });

  it("com menos de 2 selecionados, devolve os elementos sem mudança", () => {
    const a = mockElemento({ id: "a", type: "rectangle", x: 5, y: 5, width: 10, height: 10 });
    const r = alinhar([a], sel("a"), "esquerda");
    expect(r[0].x).toBe(5);
  });
});

describe("distribuir", () => {
  it("horizontal: iguala o espaço vazio entre os três, extremos não se movem", () => {
    const a = mockElemento({ id: "a", type: "rectangle", x: 0, y: 0, width: 10, height: 10 });
    const b = mockElemento({ id: "b", type: "rectangle", x: 20, y: 0, width: 10, height: 10 });
    const c = mockElemento({ id: "c", type: "rectangle", x: 100, y: 0, width: 10, height: 10 });
    const r = distribuir([a, b, c], sel("a", "b", "c"), "horizontal");

    expect(r.find((e) => e.id === "a")!.x).toBe(0); // fixo
    expect(r.find((e) => e.id === "c")!.x).toBe(100); // fixo
    // vão de a(0-10) até c(100-110) = 110; ocupado por a+b+c = 30; vazio = 80, /2 gaps = 40
    // b: cursor = 10 (fim de a) + 40 = 50
    expect(r.find((e) => e.id === "b")!.x).toBe(50);
  });

  it("vertical: mesmo raciocínio no eixo Y", () => {
    const a = mockElemento({ id: "a", type: "rectangle", x: 0, y: 0, width: 10, height: 10 });
    const b = mockElemento({ id: "b", type: "rectangle", x: 0, y: 15, width: 10, height: 10 });
    const c = mockElemento({ id: "c", type: "rectangle", x: 0, y: 100, width: 10, height: 10 });
    const r = distribuir([a, b, c], sel("a", "b", "c"), "vertical");
    expect(r.find((e) => e.id === "a")!.y).toBe(0);
    expect(r.find((e) => e.id === "c")!.y).toBe(100);
    // vão de a(0-10) até c(100-110) = 110; ocupado por a+b+c = 30; vazio = 80, /2 gaps = 40
    // b: cursor = 10 (fim de a) + 40 = 50
    expect(r.find((e) => e.id === "b")!.y).toBe(50);
  });

  it("com espaçamento desigual de entrada, o espaço fica igual na saída", () => {
    const a = mockElemento({ id: "a", type: "rectangle", x: 0, y: 0, width: 10, height: 10 });
    const b = mockElemento({ id: "b", type: "rectangle", x: 12, y: 0, width: 10, height: 10 }); // gap 2
    const c = mockElemento({ id: "c", type: "rectangle", x: 200, y: 0, width: 10, height: 10 }); // gap enorme
    const r = distribuir([a, b, c], sel("a", "b", "c"), "horizontal");
    const bNovo = r.find((e) => e.id === "b")!;
    const gap1 = bNovo.x - 10; // fim de a até início de b
    const gap2 = 200 - (bNovo.x + 10); // fim de b até início de c
    expect(gap1).toBeCloseTo(gap2);
  });

  it("com menos de 3 selecionados, devolve os elementos sem mudança", () => {
    const a = mockElemento({ id: "a", type: "rectangle", x: 0, y: 0, width: 10, height: 10 });
    const b = mockElemento({ id: "b", type: "rectangle", x: 50, y: 0, width: 10, height: 10 });
    const r = distribuir([a, b], sel("a", "b"), "horizontal");
    expect(r.find((e) => e.id === "b")!.x).toBe(50);
  });
});
