// src/sync/servicoSyncAtual.test.ts
import { describe, it, expect } from "vitest";

import { servicoSyncAtual } from "./servicoSyncAtual";
import { ServicoSyncLocal } from "./ServicoSyncLocal";
import { ServicoSyncHttp } from "./ServicoSyncHttp";

describe("servicoSyncAtual", () => {
  it("em DEV (ambiente dos testes) devolve ServicoSyncLocal", () => {
    // vitest roda com import.meta.env.DEV === true (mesmo modo do `npm run tauri dev`).
    expect(import.meta.env.DEV).toBe(true);
    expect(servicoSyncAtual()).toBeInstanceOf(ServicoSyncLocal);
  });

  it("nunca devolve ServicoSyncHttp em DEV", () => {
    expect(servicoSyncAtual()).not.toBeInstanceOf(ServicoSyncHttp);
  });
});
