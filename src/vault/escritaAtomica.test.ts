import { describe, it, expect, beforeEach, vi } from "vitest";

// O módulo importa o plugin-fs no topo; no teste só exercitamos as funções puras do
// mapa anti-loop, então o plugin é dublado.
vi.mock("@tauri-apps/plugin-fs", () => ({
  writeTextFile: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
  remove: vi.fn(),
}));

import {
  hashConteudo,
  registrarEscritaPropria,
  deveIgnorarEvento,
  _limparRegistros,
} from "./escritaAtomica";

describe("mapa anti-loop watcher ↔ autosave", () => {
  beforeEach(() => {
    _limparRegistros();
    vi.useRealTimers();
  });

  it("ignora o evento do watcher quando o conteúdo em disco bate com a gravação nossa", async () => {
    const caminho = "C:/vault/Nota.md";
    const conteudo = "# Nota\n\nlinha";
    const h = await hashConteudo(conteudo);

    registrarEscritaPropria(caminho, h);

    // O watcher no Windows emite 2–3 eventos por gravação: todos devem ser ignorados.
    expect(deveIgnorarEvento(caminho, h)).toBe(true);
    expect(deveIgnorarEvento(caminho, h)).toBe(true);
    expect(deveIgnorarEvento(caminho, h)).toBe(true);
  });

  it("não ignora quando o conteúdo em disco difere (edição externa de verdade)", async () => {
    const caminho = "C:/vault/Nota.md";
    registrarEscritaPropria(caminho, await hashConteudo("versão nossa"));
    expect(deveIgnorarEvento(caminho, await hashConteudo("versão de fora"))).toBe(
      false,
    );
  });

  it("não ignora um caminho que nunca gravamos", async () => {
    expect(
      deveIgnorarEvento("C:/vault/Outra.md", await hashConteudo("x")),
    ).toBe(false);
  });

  it("expira o registro depois de 2 segundos", async () => {
    vi.useFakeTimers();
    const caminho = "C:/vault/Nota.md";
    const h = await hashConteudo("conteúdo");
    registrarEscritaPropria(caminho, h);
    expect(deveIgnorarEvento(caminho, h)).toBe(true);

    vi.advanceTimersByTime(2001);
    expect(deveIgnorarEvento(caminho, h)).toBe(false);
  });

  it("hash é estável e sensível ao conteúdo", async () => {
    expect(await hashConteudo("a")).toBe(await hashConteudo("a"));
    expect(await hashConteudo("a")).not.toBe(await hashConteudo("b"));
  });
});
