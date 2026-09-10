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

// Mock do plugin-store (mesmo estilo de prefsStore.test.ts): um settings.json em memória.
const { storeMem } = vi.hoisted(() => ({ storeMem: new Map<string, unknown>() }));

vi.mock("@tauri-apps/plugin-store", () => ({
  load: async () => ({
    get: async (k: string) => storeMem.get(k),
    set: async (k: string, v: unknown) => void storeMem.set(k, v),
    save: async () => {},
  }),
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

import type { Comentario } from "../tarefas/tipos";

describe("tarefasStore — comentários", () => {
  beforeEach(reset);

  async function comUmaTarefa() {
    await useTarefasStore.getState().carregar();
    useTarefasStore.getState().criar("hoje", "T", "2026-09-09");
    return useTarefasStore.getState().tarefas[0].id;
  }

  it("adiciona comentário com carimbo e editadoEm nulo", async () => {
    const id = await comUmaTarefa();
    useTarefasStore.getState().adicionarComentario(id, "oi [[Nota]]");
    const c = useTarefasStore.getState().tarefas[0].comentarios[0];
    expect(c.texto).toBe("oi [[Nota]]");
    expect(c.editadoEm).toBeNull();
    expect(typeof c.criadoEm).toBe("string");
  });

  it("editar seta editadoEm e troca o texto", async () => {
    const id = await comUmaTarefa();
    useTarefasStore.getState().adicionarComentario(id, "a");
    const cid = useTarefasStore.getState().tarefas[0].comentarios[0].id;
    useTarefasStore.getState().editarComentario(id, cid, "b");
    const c = useTarefasStore.getState().tarefas[0].comentarios[0];
    expect(c.texto).toBe("b");
    expect(typeof c.editadoEm).toBe("string");
  });

  it("remover e restaurar no mesmo índice", async () => {
    const id = await comUmaTarefa();
    useTarefasStore.getState().adicionarComentario(id, "a");
    useTarefasStore.getState().adicionarComentario(id, "b");
    const [c0] = useTarefasStore.getState().tarefas[0].comentarios;
    useTarefasStore.getState().removerComentario(id, c0.id);
    expect(useTarefasStore.getState().tarefas[0].comentarios.map((c) => c.texto)).toEqual(["b"]);
    useTarefasStore.getState().restaurarComentario(id, c0 as Comentario, 0);
    expect(useTarefasStore.getState().tarefas[0].comentarios.map((c) => c.texto)).toEqual(["a", "b"]);
  });
});

describe("tarefasStore — apagar tarefa", () => {
  beforeEach(reset);

  it("removerTarefa tira a tarefa da lista", async () => {
    await useTarefasStore.getState().carregar();
    useTarefasStore.getState().criar("hoje", "T", HOJE);
    const t = useTarefasStore.getState().tarefas[0];
    useTarefasStore.getState().removerTarefa(t.id);
    expect(useTarefasStore.getState().tarefas).toEqual([]);
  });

  it("removerTarefa fecha o modal se a tarefa apagada era a aberta", async () => {
    await useTarefasStore.getState().carregar();
    useTarefasStore.getState().criar("hoje", "T", HOJE);
    const t = useTarefasStore.getState().tarefas[0];
    useTarefasStore.getState().abrirModal(t.id);
    useTarefasStore.getState().removerTarefa(t.id);
    expect(useTarefasStore.getState().tarefaAberta).toBeNull();
  });

  it("removerTarefa não mexe no modal de outra tarefa", async () => {
    await useTarefasStore.getState().carregar();
    useTarefasStore.getState().criar("hoje", "A", HOJE);
    useTarefasStore.getState().criar("hoje", "B", HOJE);
    const [a, b] = useTarefasStore.getState().tarefas;
    useTarefasStore.getState().abrirModal(b.id);
    useTarefasStore.getState().removerTarefa(a.id);
    expect(useTarefasStore.getState().tarefaAberta).toBe(b.id);
  });

  it("restaurarTarefa devolve a tarefa exatamente como estava", async () => {
    await useTarefasStore.getState().carregar();
    useTarefasStore.getState().criar("proxima-semana", "T", HOJE);
    const t = useTarefasStore.getState().tarefas[0];
    useTarefasStore.getState().removerTarefa(t.id);
    useTarefasStore.getState().restaurarTarefa(t);
    expect(useTarefasStore.getState().tarefas).toEqual([t]);
  });
});

describe("tarefasStore — estado de UI", () => {
  beforeEach(() => {
    reset();
    storeMem.clear();
    useTarefasStore.setState({
      painelAberto: true,
      larguraPainel: 320,
      concluidasExpandidas: false,
      tarefaAberta: null,
    });
  });

  it("definirLargura faz clamp em [280, 480]", () => {
    useTarefasStore.getState().definirLargura(100);
    expect(useTarefasStore.getState().larguraPainel).toBe(280);
    useTarefasStore.getState().definirLargura(9999);
    expect(useTarefasStore.getState().larguraPainel).toBe(480);
    useTarefasStore.getState().definirLargura(360);
    expect(useTarefasStore.getState().larguraPainel).toBe(360);
  });

  it("alternarPainel inverte e escreve no settings", async () => {
    useTarefasStore.getState().alternarPainel();
    expect(useTarefasStore.getState().painelAberto).toBe(false);
    await Promise.resolve();
    expect(storeMem.get("painelTarefasAberto")).toBe(false);
  });

  it("abrir e fechar modal", () => {
    useTarefasStore.getState().abrirModal("t-1");
    expect(useTarefasStore.getState().tarefaAberta).toBe("t-1");
    useTarefasStore.getState().fecharModal();
    expect(useTarefasStore.getState().tarefaAberta).toBeNull();
  });

  it("carregarPrefs lê do settings", async () => {
    storeMem.set("painelTarefasAberto", false);
    storeMem.set("larguraPainelTarefas", 400);
    await useTarefasStore.getState().carregarPrefs();
    expect(useTarefasStore.getState().painelAberto).toBe(false);
    expect(useTarefasStore.getState().larguraPainel).toBe(400);
  });
});
