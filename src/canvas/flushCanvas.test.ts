// Registro de flush do canvas (auditoria 12/09, achado 05): quem fecha a janela ou a aba
// executa a serialização pendente antes do flush dos documentos.
import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  registrarFlushCanvas,
  desregistrarFlushCanvas,
  marcarFlushCanvasEmVoo,
  flusharCanvas,
} from "./flushCanvas";

beforeEach(async () => {
  // Limpa registros de outros testes drenando e desregistrando os caminhos usados.
  for (const p of ["A.draw.md", "B.draw.md"]) {
    desregistrarFlushCanvas(p);
  }
  await flusharCanvas();
});

describe("flushCanvas", () => {
  it("flusharCanvas(path) executa o flush pendente daquele caminho", async () => {
    const fn = vi.fn(async () => {});
    registrarFlushCanvas("A.draw.md", fn);

    await flusharCanvas("A.draw.md");

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("flusharCanvas() sem path executa todos os pendentes", async () => {
    const a = vi.fn(async () => {});
    const b = vi.fn(async () => {});
    registrarFlushCanvas("A.draw.md", a);
    registrarFlushCanvas("B.draw.md", b);

    await flusharCanvas();

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("desregistrar remove o flush — não executa nada", async () => {
    const fn = vi.fn(async () => {});
    registrarFlushCanvas("A.draw.md", fn);
    desregistrarFlushCanvas("A.draw.md");

    await flusharCanvas("A.draw.md");

    expect(fn).not.toHaveBeenCalled();
  });

  it("flush em voo (desmontar) é aguardado por flusharCanvas", async () => {
    let resolveVoo!: () => void;
    let executado = false;
    const voo = new Promise<void>((r) => (resolveVoo = r)).then(() => {
      executado = true;
    });
    marcarFlushCanvasEmVoo("A.draw.md", voo);

    const dreno = flusharCanvas("A.draw.md");
    await Promise.resolve();
    expect(executado).toBe(false);
    resolveVoo();
    await dreno;
    expect(executado).toBe(true);
  });
});
