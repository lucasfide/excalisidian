import { describe, it, expect, vi, beforeEach } from "vitest";

// ——— mocks dos módulos do Tauri: emit/listen viram controláveis pelo teste, e a lista de
// janelas é o que cada teste define em `janelasFalsas`. ———

const { ouvintes, emitidos, janelasFalsas, labelAtual } = vi.hoisted(() => ({
  ouvintes: new Map<string, Array<(evento: { payload: unknown }) => void>>(),
  emitidos: [] as Array<{ evento: string; payload: unknown }>,
  janelasFalsas: { lista: ["main"] as string[] },
  labelAtual: { valor: "main" },
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (evento: string, cb: (e: { payload: unknown }) => void) => {
    if (!ouvintes.has(evento)) ouvintes.set(evento, []);
    ouvintes.get(evento)!.push(cb);
    return () => {
      const lista = ouvintes.get(evento);
      if (!lista) return;
      const i = lista.indexOf(cb);
      if (i >= 0) lista.splice(i, 1);
    };
  }),
  emit: vi.fn(async (evento: string, payload: unknown) => {
    emitidos.push({ evento, payload });
    // simula o broadcast do Tauri: entrega pra todo `listen` desta mesma janela de teste.
    for (const cb of ouvintes.get(evento) ?? []) cb({ payload });
  }),
}));

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => ({ label: labelAtual.valor }),
  getAllWebviewWindows: async () => janelasFalsas.lista.map((label) => ({ label })),
}));

const flushMock = vi.fn(async () => ({ falhas: [], bloqueados: [], tarefasOk: true }));
vi.mock("../estado/flushGeral", () => ({
  flusharTudoAntesDeSair: () => flushMock(),
}));

const carregarPrefsMock = vi.fn(async () => {});
vi.mock("../estado/prefsStore", () => ({
  usePrefsStore: { getState: () => ({ carregar: carregarPrefsMock }) },
}));

const carregarAgenteMock = vi.fn(async () => {});
vi.mock("../estado/agenteStore", () => ({
  useAgenteStore: { getState: () => ({ carregar: carregarAgenteMock }) },
}));

const carregarContaMock = vi.fn(async () => {});
vi.mock("../estado/contaStore", () => ({
  useContaStore: { getState: () => ({ carregar: carregarContaMock }) },
}));

import {
  flusharTodasAsJanelas,
  instalarOuvintesEntreJanelas,
  agregarResultadoFlush,
} from "./flushEntreJanelas";

beforeEach(() => {
  ouvintes.clear();
  emitidos.length = 0;
  janelasFalsas.lista = ["main"];
  labelAtual.valor = "main";
  flushMock.mockClear();
  flushMock.mockImplementation(async () => ({ falhas: [], bloqueados: [], tarefasOk: true }));
  carregarPrefsMock.mockClear();
  carregarAgenteMock.mockClear();
  carregarContaMock.mockClear();
});

describe("agregarResultadoFlush (agregação pura)", () => {
  it("junta falhas/bloqueados prefixando com o label de quem respondeu", () => {
    const r = agregarResultadoFlush(
      { falhas: ["Aqui.md"], bloqueados: [], tarefasOk: true },
      [
        { id: "1", label: "vault-abc", falhas: ["Lá.md"], bloqueados: ["Outra.md"], tarefasOk: true },
      ],
      ["vault-abc"],
    );
    expect(r.falhas).toEqual(["Aqui.md", "vault-abc: Lá.md"]);
    expect(r.bloqueados).toEqual(["vault-abc: Outra.md"]);
    expect(r.semResposta).toEqual([]);
  });

  it("tarefasOk é AND entre a própria janela e as respostas", () => {
    const r = agregarResultadoFlush(
      { falhas: [], bloqueados: [], tarefasOk: true },
      [{ id: "1", label: "vault-x", falhas: [], bloqueados: [], tarefasOk: false }],
      ["vault-x"],
    );
    expect(r.tarefasOk).toBe(false);
  });

  it("janela esperada que não respondeu entra em semResposta", () => {
    const r = agregarResultadoFlush(
      { falhas: [], bloqueados: [], tarefasOk: true },
      [],
      ["vault-sumiu"],
    );
    expect(r.semResposta).toEqual(["vault-sumiu"]);
  });
});

describe("flusharTodasAsJanelas", () => {
  it("com só a própria janela, drena direto e não espera ninguém", async () => {
    janelasFalsas.lista = ["main"];
    const r = await flusharTodasAsJanelas();
    expect(flushMock).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ falhas: [], bloqueados: [], tarefasOk: true, semResposta: [] });
  });

  it("agrega a resposta de outra janela que respondeu a tempo", async () => {
    janelasFalsas.lista = ["main", "vault-abc"];
    labelAtual.valor = "main";

    const promessa = flusharTodasAsJanelas();
    // a resposta chega "depois" do pedido ter sido emitido — como no app de verdade.
    await Promise.resolve();
    const pedidoEmitido = emitidos.find((e) => e.evento === "app://flush-pedido");
    const id = (pedidoEmitido!.payload as { id: string }).id;
    for (const cb of ouvintes.get("app://flush-resposta") ?? []) {
      cb({ payload: { id, label: "vault-abc", falhas: ["Nota.md"], bloqueados: [], tarefasOk: true } });
    }

    const r = await promessa;
    expect(r.falhas).toEqual(["vault-abc: Nota.md"]);
    expect(r.semResposta).toEqual([]);
  });

  it("janela sem resposta dentro do timeout entra em semResposta", async () => {
    vi.useFakeTimers();
    try {
      janelasFalsas.lista = ["main", "vault-sumiu"];
      const promessa = flusharTodasAsJanelas();
      await vi.advanceTimersByTimeAsync(5000);
      const r = await promessa;
      expect(r.semResposta).toEqual(["vault-sumiu"]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("instalarOuvintesEntreJanelas", () => {
  it("responde ao pedido de flush de outra janela, mas ignora o próprio pedido", async () => {
    labelAtual.valor = "vault-abc";
    instalarOuvintesEntreJanelas();
    await Promise.resolve();

    // pedido vindo de outra janela ("main"): deve drenar e responder.
    for (const cb of ouvintes.get("app://flush-pedido") ?? []) {
      cb({ payload: { id: "1", origem: "main" } });
    }
    await Promise.resolve();
    await Promise.resolve();
    expect(flushMock).toHaveBeenCalledTimes(1);
    const resposta = emitidos.find((e) => e.evento === "app://flush-resposta");
    expect((resposta!.payload as { label: string }).label).toBe("vault-abc");

    flushMock.mockClear();
    // pedido "emitido por ela mesma" (mesma label): não drena de novo.
    for (const cb of ouvintes.get("app://flush-pedido") ?? []) {
      cb({ payload: { id: "2", origem: "vault-abc" } });
    }
    await Promise.resolve();
    expect(flushMock).not.toHaveBeenCalled();
  });

  it("recarrega prefsStore, a config do agente e a conta ao receber app://prefs-mudou", async () => {
    instalarOuvintesEntreJanelas();
    await Promise.resolve();

    for (const cb of ouvintes.get("app://prefs-mudou") ?? []) cb({ payload: undefined });

    expect(carregarPrefsMock).toHaveBeenCalledTimes(1);
    expect(carregarAgenteMock).toHaveBeenCalledTimes(1);
    expect(carregarContaMock).toHaveBeenCalledTimes(1);
  });

  it("a função de limpeza remove os dois ouvintes", async () => {
    const limpar = instalarOuvintesEntreJanelas();
    await Promise.resolve();
    expect(ouvintes.get("app://flush-pedido")?.length).toBe(1);
    expect(ouvintes.get("app://prefs-mudou")?.length).toBe(1);

    limpar();
    expect(ouvintes.get("app://flush-pedido")?.length).toBe(0);
    expect(ouvintes.get("app://prefs-mudou")?.length).toBe(0);
  });
});
