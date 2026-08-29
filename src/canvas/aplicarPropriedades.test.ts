import { describe, it, expect } from "vitest";
import { aplicarPropriedadesNaCena } from "./aplicarPropriedades";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

function mockElemento(parcial: Partial<ExcalidrawElement> & { id: string; type: string }): ExcalidrawElement {
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

describe("aplicarPropriedadesNaCena", () => {
  it("altera o tamanho do texto dentro de um contêiner quando o contêiner está selecionado", () => {
    const retangulo = mockElemento({ id: "rect1", type: "rectangle", width: 200, height: 100, x: 50, y: 50 });
    const textoVinculado = mockElemento({
      id: "text1",
      type: "text",
      width: 40,
      height: 20,
      x: 130,
      y: 90,
      fontSize: 20,
      containerId: "rect1",
      text: "Olá",
      originalText: "Olá",
    } as never);

    const elementos = [retangulo, textoVinculado];
    const selecionados = { rect1: true };

    const resultado = aplicarPropriedadesNaCena(elementos, selecionados, {
      currentItemFontSize: 36,
    });

    const textoRes = resultado.find((el) => el.id === "text1") as unknown as { fontSize: number; width: number; height: number };
    expect(textoRes.fontSize).toBe(36);
    expect(textoRes.width).toBe(40 * (36 / 20));
    expect(textoRes.height).toBe(20 * (36 / 20));
  });

  it("altera a cor do texto vinculado quando corTexto é passado", () => {
    const retangulo = mockElemento({ id: "rect1", type: "rectangle", strokeColor: "#111111" });
    const textoVinculado = mockElemento({
      id: "text1",
      type: "text",
      strokeColor: "#111111",
      containerId: "rect1",
    } as never);

    const elementos = [retangulo, textoVinculado];
    const selecionados = { rect1: true };

    const resultado = aplicarPropriedadesNaCena(elementos, selecionados, {
      corTexto: "#ff0000",
    });

    const rectRes = resultado.find((el) => el.id === "rect1");
    const textoRes = resultado.find((el) => el.id === "text1");

    expect(rectRes?.strokeColor).toBe("#111111"); // Borda não alterada
    expect(textoRes?.strokeColor).toBe("#ff0000"); // Cor do texto atualizada
  });

  it("sincroniza opacidade entre contêiner e texto vinculado", () => {
    const retangulo = mockElemento({ id: "rect1", type: "rectangle", opacity: 100 });
    const textoVinculado = mockElemento({
      id: "text1",
      type: "text",
      opacity: 100,
      containerId: "rect1",
    } as never);

    const elementos = [retangulo, textoVinculado];
    const selecionados = { rect1: true };

    const resultado = aplicarPropriedadesNaCena(elementos, selecionados, {
      currentItemOpacity: 30,
    });

    expect(resultado.find((el) => el.id === "rect1")?.opacity).toBe(30);
    expect(resultado.find((el) => el.id === "text1")?.opacity).toBe(30);
  });

  it("sincroniza contorno e fundo em Post-its ao trocar de cor", () => {
    const postit = mockElemento({
      id: "post1",
      type: "rectangle",
      strokeColor: "#EDDCB4",
      backgroundColor: "#EDDCB4",
      fillStyle: "solid",
    });

    const resultado = aplicarPropriedadesNaCena([postit], { post1: true }, {
      currentItemBackgroundColor: "#CFDBD1",
    });

    expect(resultado[0].backgroundColor).toBe("#CFDBD1");
    expect(resultado[0].strokeColor).toBe("#CFDBD1");
  });

  it("altera alinhamento e fonte de texto solto ou vinculado", () => {
    const textoSolto = mockElemento({
      id: "text1",
      type: "text",
      fontFamily: 1,
      textAlign: "left",
    } as never);

    const resultado = aplicarPropriedadesNaCena([textoSolto], { text1: true }, {
      currentItemFontFamily: 2,
      currentItemTextAlign: "center",
    });

    const res = resultado[0] as unknown as { fontFamily: number; textAlign: string };
    expect(res.fontFamily).toBe(2);
    expect(res.textAlign).toBe("center");
  });
});
