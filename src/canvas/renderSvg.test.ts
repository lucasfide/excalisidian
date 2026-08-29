import { describe, it, expect, beforeEach, vi } from "vitest";

const { exportToSvgMock, contadorRef } = vi.hoisted(() => {
  const contadorRef = { n: 0 };
  function svgFalso() {
    const marca = `svg-${++contadorRef.n}`;
    const obj: { marca: string; cloneNode: () => unknown } = {
      marca,
      cloneNode: () => obj,
    };
    return obj;
  }
  return { exportToSvgMock: vi.fn(async () => svgFalso()), contadorRef };
});
vi.mock("@excalidraw/excalidraw", () => ({ exportToSvg: exportToSvgMock }));

const disco = new Map<string, string>();
const entradas: { path: string; mtimeMs: number }[] = [];

vi.mock("../estado/vaultStore", () => ({
  useVaultStore: {
    getState: () => ({
      entradas,
      adapter: {
        async lerTexto(p: string) {
          if (!disco.has(p)) throw new Error("ENOENT");
          return disco.get(p)!;
        },
        async lerBinario() {
          throw new Error("sem arquivos embutidos neste teste");
        },
      },
    }),
  },
}));

import { renderizarSvg, limparCacheSvg } from "./renderSvg";
import { serializarDesenho } from "./formatoDesenho";

function desenhoVazio(): string {
  return serializarDesenho({
    frontmatter: {},
    verso: "",
    textElements: new Map(),
    elementLinks: new Map(),
    embeddedFiles: new Map(),
    cena: { elements: [], appState: {} },
  });
}

beforeEach(() => {
  contadorRef.n = 0;
  disco.clear();
  entradas.length = 0;
  exportToSvgMock.mockClear();
  limparCacheSvg();
});

describe("renderizarSvg — cache por mtime (doc 09, Parte 3 item 13)", () => {
  it("reaproveita o SVG em cache enquanto o mtime não muda", async () => {
    disco.set("A.draw.md", desenhoVazio());
    entradas.push({ path: "A.draw.md", mtimeMs: 1000 });

    const primeiro = (await renderizarSvg("A.draw.md")) as unknown as { marca: string };
    const segundo = (await renderizarSvg("A.draw.md")) as unknown as { marca: string };

    expect(exportToSvgMock).toHaveBeenCalledTimes(1);
    expect(primeiro.marca).toBe(segundo.marca);
  });

  it("renderiza de novo quando o mtime muda", async () => {
    disco.set("A.draw.md", desenhoVazio());
    entradas.push({ path: "A.draw.md", mtimeMs: 1000 });
    await renderizarSvg("A.draw.md");

    entradas[0].mtimeMs = 2000;
    await renderizarSvg("A.draw.md");

    expect(exportToSvgMock).toHaveBeenCalledTimes(2);
  });

  it("caminhos diferentes não compartilham cache", async () => {
    disco.set("A.draw.md", desenhoVazio());
    disco.set("B.draw.md", desenhoVazio());
    entradas.push({ path: "A.draw.md", mtimeMs: 1000 }, { path: "B.draw.md", mtimeMs: 1000 });

    await renderizarSvg("A.draw.md");
    await renderizarSvg("B.draw.md");

    expect(exportToSvgMock).toHaveBeenCalledTimes(2);
  });
});
