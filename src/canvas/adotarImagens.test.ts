import { describe, it, expect } from "vitest";

import { dataUrlParaBytes, imagensParaAdotar } from "./adotarImagens";
import { bytesParaDataUrl } from "./reidratarFiles";

const bytesPng = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);

function arquivo(id: string, mime: string, bytes = bytesPng) {
  return { id, mimeType: mime, dataURL: bytesParaDataUrl(bytes, mime), created: 0 };
}

function elImagem(fileId: string, extra: Record<string, unknown> = {}) {
  return { type: "image", fileId, ...extra };
}

describe("dataUrlParaBytes", () => {
  it("desfaz o bytesParaDataUrl", () => {
    const url = bytesParaDataUrl(bytesPng, "image/png");
    const { bytes, mime } = dataUrlParaBytes(url);
    expect(mime).toBe("image/png");
    expect([...bytes]).toEqual([...bytesPng]);
  });
});

describe("imagensParaAdotar", () => {
  const files = {
    "f-png": arquivo("f-png", "image/png"),
    "f-jpg": arquivo("f-jpg", "image/jpeg"),
    "f-svg": arquivo("f-svg", "image/svg+xml"),
  };

  it("adota imagem presente em files e ausente dos embeds", () => {
    const r = imagensParaAdotar([elImagem("f-png")], files, new Set());
    expect(r).toHaveLength(1);
    expect(r[0].fileId).toBe("f-png");
    expect(r[0].ext).toBe("png");
    expect([...r[0].bytes]).toEqual([...bytesPng]);
  });

  it("deriva extensão de jpeg e svg", () => {
    const r = imagensParaAdotar(
      [elImagem("f-jpg"), elImagem("f-svg")],
      files,
      new Set(),
    );
    expect(r.map((x) => x.ext).sort()).toEqual(["jpg", "svg"]);
  });

  it("pula fileId já embedado", () => {
    const r = imagensParaAdotar([elImagem("f-png")], files, new Set(["f-png"]));
    expect(r).toEqual([]);
  });

  it("pula elemento de imagem deletado", () => {
    const r = imagensParaAdotar(
      [elImagem("f-png", { isDeleted: true })],
      files,
      new Set(),
    );
    expect(r).toEqual([]);
  });

  it("pula fileId sem entrada em files, sem quebrar", () => {
    const r = imagensParaAdotar([elImagem("f-ausente")], files, new Set());
    expect(r).toEqual([]);
  });

  it("ignora elementos que não são imagem", () => {
    const r = imagensParaAdotar(
      [{ type: "rectangle" }, { type: "text", fileId: "f-png" }],
      files,
      new Set(),
    );
    expect(r).toEqual([]);
  });

  it("mesmo fileId em dois elementos vira uma entrada só", () => {
    const r = imagensParaAdotar(
      [elImagem("f-png"), elImagem("f-png")],
      files,
      new Set(),
    );
    expect(r).toHaveLength(1);
  });

  it("ignora imagem sem fileId", () => {
    const r = imagensParaAdotar([{ type: "image" }], files, new Set());
    expect(r).toEqual([]);
  });
});
