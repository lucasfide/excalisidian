import { describe, it, expect, beforeEach, vi } from "vitest";

// O store usa window.setTimeout (contexto do webview). No ambiente node do vitest,
// aponta window para o global.
vi.stubGlobal("window", globalThis);

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

// Stub do adapter: um "disco" em memória.
const disco = new Map<string, string>();
const adapterStub = {
  raiz: () => "/vault",
  existe: vi.fn(async (p: string) => disco.has(p)),
  lerTexto: vi.fn(async (p: string) => disco.get(p) ?? ""),
  escreverTexto: vi.fn(async (p: string, c: string) => void disco.set(p, c)),
  criarPasta: vi.fn(async () => {}),
};

vi.mock("./vaultStore", () => ({
  useVaultStore: { getState: () => ({ adapter: adapterStub }) },
}));

import { useTarefasStore, CAMINHO_TAREFAS } from "./tarefasStore";

const HOJE = "2026-09-09";

function reset() {
  disco.clear();
  vi.clearAllMocks();
  useTarefasStore.setState({ tarefas: [], carregado: false });
}

describe("tarefasStore — carga e CRUD", () => {
  beforeEach(reset);

  it("carregar sem arquivo deixa lista vazia e carregado=true", async () => {
    await useTarefasStore.getState().carregar();
    expect(useTarefasStore.getState().tarefas).toEqual([]);
    expect(useTarefasStore.getState().carregado).toBe(true);
  });

  it("carregar lê e popula do disco", async () => {
    disco.set(CAMINHO_TAREFAS, JSON.stringify({
      versao: 1,
      tarefas: [{ id: "t-1", titulo: "x", vencimento: "2026-09-10", ordem: 10, concluida: false, concluidaEm: null, criadaEm: "z", comentarios: [] }],
    }));
    await useTarefasStore.getState().carregar();
    expect(useTarefasStore.getState().tarefas.map((t) => t.id)).toEqual(["t-1"]);
  });

  it("carregar com JSON corrompido: lista vazia, e não sobrescreve o arquivo", async () => {
    disco.set(CAMINHO_TAREFAS, "{ corrompido");
    await useTarefasStore.getState().carregar();
    expect(useTarefasStore.getState().tarefas).toEqual([]);
    await useTarefasStore.getState()._persistirAgora();
    expect(disco.get(CAMINHO_TAREFAS)).toBe("{ corrompido");
  });

  it("criar adiciona tarefa com vencimento e ordem da seção", async () => {
    await useTarefasStore.getState().carregar();
    useTarefasStore.getState().criar("amanha", "Ligar", HOJE);
    const t = useTarefasStore.getState().tarefas[0];
    expect(t.titulo).toBe("Ligar");
    expect(t.vencimento).toBe("2026-09-10");
    expect(t.ordem).toBe(10);
    useTarefasStore.getState().criar("amanha", "Outra", HOJE);
    expect(useTarefasStore.getState().tarefas[1].ordem).toBe(20);
  });

  it("criar com título vazio ou só espaço não cria nada", async () => {
    await useTarefasStore.getState().carregar();
    useTarefasStore.getState().criar("hoje", "   ", HOJE);
    expect(useTarefasStore.getState().tarefas).toEqual([]);
  });

  it("alternarConcluida marca, carimba e desmarca voltando para hoje", async () => {
    await useTarefasStore.getState().carregar();
    useTarefasStore.getState().criar("proxima-semana", "X", HOJE);
    const id = useTarefasStore.getState().tarefas[0].id;

    useTarefasStore.getState().alternarConcluida(id, HOJE);
    let t = useTarefasStore.getState().tarefas[0];
    expect(t.concluida).toBe(true);
    expect(typeof t.concluidaEm).toBe("string");

    useTarefasStore.getState().alternarConcluida(id, HOJE);
    t = useTarefasStore.getState().tarefas[0];
    expect(t.concluida).toBe(false);
    expect(t.concluidaEm).toBeNull();
    expect(t.vencimento).toBe(HOJE);
  });

  it("moverTarefa reescreve vencimento para a data da seção alvo", async () => {
    await useTarefasStore.getState().carregar();
    useTarefasStore.getState().criar("hoje", "X", HOJE);
    const id = useTarefasStore.getState().tarefas[0].id;
    useTarefasStore.getState().moverTarefa(id, "proxima-semana", 0, HOJE);
    expect(useTarefasStore.getState().tarefas[0].vencimento).toBe("2026-09-19");
  });

  it("_persistirAgora grava o JSON serializado e pula quando nada mudou", async () => {
    await useTarefasStore.getState().carregar();
    useTarefasStore.getState().criar("hoje", "X", HOJE);
    await useTarefasStore.getState()._persistirAgora();
    expect(adapterStub.escreverTexto).toHaveBeenCalledWith(CAMINHO_TAREFAS, expect.stringContaining('"titulo": "X"'));

    adapterStub.escreverTexto.mockClear();
    await useTarefasStore.getState()._persistirAgora();
    expect(adapterStub.escreverTexto).not.toHaveBeenCalled();
  });
});
