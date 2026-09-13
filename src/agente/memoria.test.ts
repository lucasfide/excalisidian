// Doc 11 §12, item 6 (parte de memória): round-trip dos arquivos e poda de resumos.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { stores } = vi.hoisted(() => ({
  stores: new Map<string, Map<string, unknown>>(),
}));
vi.mock("@tauri-apps/plugin-store", () => ({
  load: async (nome: string) => {
    if (!stores.has(nome)) stores.set(nome, new Map());
    const mem = stores.get(nome)!;
    return {
      get: async (k: string) => mem.get(k),
      set: async (k: string, v: unknown) => void mem.set(k, v),
      save: async () => {},
      delete: async (k: string) => void mem.delete(k),
    };
  },
}));

import {
  adicionarFatos,
  carregarConversas,
  carregarFatos,
  carregarParticipacao,
  carregarResumos,
  limparMemoria,
  salvarConversas,
  salvarFatos,
  salvarParticipacao,
  salvarResumos,
  pastaAgenteRelativa,
} from "./memoria";
import { hashVault } from "../indice/cache";

const RAIZ = "C:/vault";

beforeEach(() => stores.clear());

describe("memoria", () => {
  it("participação round-trip; arquivo inexistente é mapa vazio", async () => {
    expect(await carregarParticipacao(RAIZ)).toEqual({});
    await salvarParticipacao(RAIZ, { "a.md": "recusado", "b.md": "aceito" });
    expect(await carregarParticipacao(RAIZ)).toEqual({
      "a.md": "recusado",
      "b.md": "aceito",
    });
  });

  it("resumos round-trip por caminho", async () => {
    await salvarResumos(RAIZ, {
      "x.md": { mtimeMs: 5, size: 10, resumo: "nota sobre y" },
    });
    expect(await carregarResumos(RAIZ)).toEqual({
      "x.md": { mtimeMs: 5, size: 10, resumo: "nota sobre y" },
    });
  });

  it("resumos acima de 400 são podados pelos mais antigos por inserção", async () => {
    const mapa: Record<string, { mtimeMs: number; size: number; resumo: string }> = {};
    for (let i = 0; i < 450; i++) {
      mapa[`n${i}.md`] = { mtimeMs: i, size: 1, resumo: "r" };
    }
    await salvarResumos(RAIZ, mapa);
    const lidos = await carregarResumos(RAIZ);
    expect(Object.keys(lidos)).toHaveLength(400);
    expect(lidos["n0.md"]).toBeUndefined();
    expect(lidos["n449.md"]).toBeDefined();
  });

  it("os arquivos vivem na pasta do vault certo, separados por vault", async () => {
    await salvarParticipacao(RAIZ, { "a.md": "aceito" });
    await salvarParticipacao("C:/outro", { "b.md": "recusado" });
    expect(await carregarParticipacao(RAIZ)).toEqual({ "a.md": "aceito" });
    expect(await carregarParticipacao("C:/outro")).toEqual({ "b.md": "recusado" });
    expect(pastaAgenteRelativa(RAIZ)).toBe(`agente/${hashVault(RAIZ)}`);
  });

  it("JSON corrompido no cache é tratado como vazio (nunca trava)", async () => {
    stores.set(`agente/${hashVault(RAIZ)}/participacao.json`, new Map([
      ["dados", { version: 999, dados: "não importa" }],
    ]));
    expect(await carregarParticipacao(RAIZ)).toEqual({});
  });

  it("adicionarFatos deduplica por texto e aplica FIFO no teto de 100", () => {
    let fatos: import("./memoria").Fato[] = [];
    fatos = adicionarFatos(fatos, ["usa Core para o backend", "  ", "usa Core para o backend"], "N.md");
    expect(fatos).toHaveLength(1);
    expect(fatos[0].notaOrigem).toBe("N.md");
    const muitos = Array.from({ length: 150 }, (_, i) => `fato ${i}`);
    const cheios = adicionarFatos([], muitos, null);
    expect(cheios).toHaveLength(100);
    expect(cheios[0].texto).toBe("fato 50");
  });

  it("fatos e conversas round-trip; limparMemoria esvazia tudo", async () => {
    await salvarFatos(RAIZ, [
      { id: "f-1", texto: "t", notaOrigem: null, criadoEm: "2026-09-13" },
    ]);
    await salvarConversas(RAIZ, {
      "N.md": { atualizadaEm: "2026-09-13", mensagens: [{ papel: "usuario", texto: "oi" }] },
    });
    expect((await carregarFatos(RAIZ))[0].texto).toBe("t");
    expect((await carregarConversas(RAIZ))["N.md"].mensagens).toHaveLength(1);

    await limparMemoria(RAIZ);
    expect(await carregarFatos(RAIZ)).toEqual([]);
    expect(await carregarConversas(RAIZ)).toEqual({});
    expect(await carregarParticipacao(RAIZ)).toEqual({});
    expect(await carregarResumos(RAIZ)).toEqual({});
  });
});
