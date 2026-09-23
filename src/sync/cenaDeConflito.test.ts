// src/sync/cenaDeConflito.test.ts
import { describe, it, expect } from "vitest";

import { lerCenaDeConflito } from "./cenaDeConflito";
import { desenhoVazio, serializarDesenho, blockIdsDaCena } from "../canvas/formatoDesenho";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

function el(over: Record<string, unknown>): ExcalidrawElement {
  return {
    version: 1,
    versionNonce: 0,
    updated: 0,
    seed: 1,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    ...over,
  } as unknown as ExcalidrawElement;
}

const CORROMPIDO = `---
excalisidian: drawing
---
%%
# Excalisidian Drawing

## Text Elements

## Element Links

## Embedded Files

## Scene
\`\`\`draw-json
{ isso nao e json
\`\`\`
%%
`;

describe("lerCenaDeConflito", () => {
  it("desenho válido e vazio abre com ok:true e sem elementos", () => {
    const r = lerCenaDeConflito(desenhoVazio());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cena.elements).toEqual([]);
  });

  it("desenho com elementos abre e preserva os elementos", () => {
    const elements = [el({ id: "rect_A1", type: "rectangle" })];
    const idPorEl = blockIdsDaCena(elements);
    void idPorEl;
    const md = serializarDesenho({
      frontmatter: {},
      verso: "",
      textElements: new Map(),
      elementLinks: new Map(),
      embeddedFiles: new Map(),
      cena: { elements, appState: {} },
    });
    const r = lerCenaDeConflito(md);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cena.elements).toHaveLength(1);
  });

  it("JSON de cena corrompido: ok:false, sem lançar", () => {
    const r = lerCenaDeConflito(CORROMPIDO);
    expect(r.ok).toBe(false);
  });

  it("conteúdo sem bloco de cena (não é corrupção, é ausência): abre vazio", () => {
    const r = lerCenaDeConflito("isso não é um .draw.md");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cena.elements).toEqual([]);
  });
});
