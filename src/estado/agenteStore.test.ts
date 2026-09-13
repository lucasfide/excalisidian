// RF11.2 (config persistida; sem config nada acontece) + conversa manual da fase 1 +
// fluxo gateiro→convite→ciclo das fases 2/3.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.stubGlobal("window", globalThis);

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

vi.mock("../agente/cliente", () => ({
  completar: vi.fn(async () => ({
    texto: "resposta do modelo",
    uso: { tokensEntrada: 40, tokensSaida: 8 },
  })),
  listarModelos: vi.fn(async () => ["gpt-5.6-luna", "gpt-5.4-mini"]),
  textoDoErro: vi.fn(() => "erro simulado"),
}));

const notaAberta = {
  path: "Nota.md",
  conteudoEditor: "O texto da nota aberta.",
  conteudoDisco: "x",
  estado: "editando" as const,
  erro: null,
  versao: 0,
};
const { dispararDocs } = vi.hoisted(() => ({ dispararDocs: { lista: [] as Array<() => void> } }));
vi.mock("./workspaceStore", () => ({
  useWorkspaceStore: {
    getState: () => ({ caminhoAtivo: "Nota.md" }),
    subscribe: () => () => {},
  },
}));
vi.mock("./documentosStore", () => ({
  useDocumentosStore: {
    getState: () => ({ docs: new Map([["Nota.md", notaAberta]]) }),
    subscribe: (cb: (s: unknown, p: unknown) => void) => {
      const wrapped = () => cb({ docs: new Map() }, { docs: "anterior" });
      dispararDocs.lista.push(wrapped);
      return () => {
        const i = dispararDocs.lista.indexOf(wrapped);
        if (i >= 0) dispararDocs.lista.splice(i, 1);
      };
    },
  },
}));

// vaultStore: o ciclo lê indice/links/adapter daqui.
const indice = new Map<string, { mtimeMs: number; size: number; title: string; outLinks: []; embeds: [] }>();
vi.mock("./vaultStore", () => ({
  useVaultStore: {
    getState: () => ({
      adapter: { lerTexto: async (p: string) => indice.get(p)?.title ?? "conteudo de " + p },
      indice,
      links: { backlinks: new Map(), naoResolvidos: new Map() },
      resolver: () => null,
    }),
  },
}));

import { useAgenteStore } from "./agenteStore";
import { completar } from "../agente/cliente";
import type { ConfigAgente } from "../agente/tipos";

const st = () => useAgenteStore.getState();

const CONFIG: ConfigAgente = {
  habilitado: true,
  provedor: "openai",
  chaves: { openai: "sk-teste" },
  baseUrls: {},
  modeloGateiro: "gpt-5.4-mini",
  modeloAssistente: "gpt-5.6-luna",
  thinking: "baixo",
  webSearch: false,
  tetoDiarioUsd: null,
};

beforeEach(() => {
  stores.clear();
  vi.mocked(completar).mockReset();
  vi.mocked(completar).mockImplementation(async () => ({
    texto: "resposta do modelo",
    uso: { tokensEntrada: 40, tokensSaida: 8 },
  }));
  notaAberta.conteudoEditor = "O texto da nota aberta.";
  useAgenteStore.setState({
    config: null,
    carregado: false,
    status: "desligado",
    erroAtual: null,
    pausado: false,
    painelAberto: false,
    assistenteAberto: false,
    conversas: {},
    usoSessao: { tokensEntrada: 0, tokensSaida: 0 },
    raiz: null,
    participacao: {},
    convite: null,
    sugestoes: {},
    fatos: [],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("agenteStore", () => {
  it("sem config salva: status desligado e enviarMensagem não chama a rede", async () => {
    await st().carregar();
    expect(st().config).toBeNull();
    await st().enviarMensagem("oi");
    expect(completar).not.toHaveBeenCalled();
  });

  it("aplicarConfig persiste no settings.json e carregar restaura", async () => {
    await st().aplicarConfig(CONFIG);
    await st().carregar();
    expect(st().config?.modeloAssistente).toBe("gpt-5.6-luna");
    expect(st().status).toBe("ocioso");
  });

  it("definirHabilitado(false) desliga sem apagar a configuração", async () => {
    await st().aplicarConfig(CONFIG);
    await st().definirHabilitado(false);
    expect(st().config?.habilitado).toBe(false);
    expect(st().config?.modeloAssistente).toBe("gpt-5.6-luna");
    expect(st().status).toBe("desligado");
  });

  it("enviarMensagem: manda contexto da nota ativa, acumula tokens, mantém a conversa", async () => {
    await st().aplicarConfig(CONFIG);

    await st().enviarMensagem("o que falta nesta nota?");

    const pedido = vi.mocked(completar).mock.calls[0][0];
    expect(pedido.modelo).toBe("gpt-5.6-luna");
    expect(pedido.system).toContain("Nota.md");
    expect(pedido.system).toContain("O texto da nota aberta.");
    expect(st().conversas["Nota.md"]).toEqual([
      { papel: "usuario", texto: "o que falta nesta nota?" },
      { papel: "assistente", texto: "resposta do modelo" },
    ]);
    expect(st().usoSessao).toEqual({ tokensEntrada: 40, tokensSaida: 8 });
  });

  it("texto vazio não envia; pausado bloqueia envio (RF11.14)", async () => {
    await st().aplicarConfig(CONFIG);
    await st().enviarMensagem("   ");
    expect(completar).not.toHaveBeenCalled();

    st().pausar();
    await st().enviarMensagem("agora?");
    expect(completar).not.toHaveBeenCalled();
  });

  it("falha do provedor: erro visível no estado, sem exceção para fora (RF11.15)", async () => {
    vi.mocked(completar).mockRejectedValueOnce(new Error("boom"));
    await st().aplicarConfig(CONFIG);

    await st().enviarMensagem("oi");

    expect(st().status).toBe("erro");
    expect(st().erroAtual).toBe("erro simulado");
    expect(st().conversas["Nota.md"][0]).toEqual({ papel: "usuario", texto: "oi" });
  });

  it("testarConexao: null quando o provedor responde, mensagem quando falha", async () => {
    await st().aplicarConfig(CONFIG);
    expect(await st().testarConexao()).toBeNull();

    const { listarModelos } = await import("../agente/cliente");
    vi.mocked(listarModelos).mockRejectedValueOnce(new Error("sem rede"));
    expect(await st().testarConexao()).toBe("erro simulado");
  });
});

// ——— fases 2/3 do doc 11: gateiro → convite → ciclo contínuo ———

import { hashVault } from "../indice/cache";

function respostaPorPapel(p: { system: string }) {
  if (p.system.startsWith("Você analisa notas")) {
    return {
      texto: '{"valeParticipar": true, "tema": "arquitetura", "confianca": 0.9}',
      uso: { tokensEntrada: 5, tokensSaida: 5 },
    };
  }
  return {
    texto:
      '{"sugestoes":[{"tipo":"pergunta","texto":"Falta o prazo da entrega?"}],"novosFatos":[]}',
    uso: { tokensEntrada: 20, tokensSaida: 10 },
  };
}

describe("agenteStore — gateiro, convite e ciclo", () => {
  it("inatividade dispara o gateiro; convite abre o painel", async () => {
    vi.useFakeTimers();
    vi.mocked(completar).mockImplementation(async (p) => respostaPorPapel(p));
    notaAberta.conteudoEditor = "x".repeat(500);

    await st().aplicarConfig(CONFIG);
    await st().aoAbrirVault("C:/vault");
    st().conectarGatilhos();
    for (const f of dispararDocs.lista) f(); // simula uma tecla

    await vi.advanceTimersByTimeAsync(6000);

    expect(st().convite).toEqual({ path: "Nota.md", tema: "arquitetura" });
    expect(st().painelAberto).toBe(true);
  });

  it("aceitar dispara o ciclo imediatamente; sugestão entra no estado e a participação persiste", async () => {
    vi.useFakeTimers();
    vi.mocked(completar).mockImplementation(async (p) => respostaPorPapel(p));
    notaAberta.conteudoEditor = "x".repeat(500);
    await st().aplicarConfig(CONFIG);
    await st().aoAbrirVault("C:/vault");
    await vi.advanceTimersByTimeAsync(6000);
    expect(st().convite).not.toBeNull();

    st().responderConvite("aceitar");
    await vi.advanceTimersByTimeAsync(10);

    expect(st().sugestoes["Nota.md"]).toHaveLength(1);
    expect(st().sugestoes["Nota.md"][0].texto).toBe("Falta o prazo da entrega?");
    expect(st().participacao["Nota.md"]).toBe("aceito");
    expect(st().convite).toBeNull();

    await vi.advanceTimersByTimeAsync(1000); // debounce da persistência
    const arquivo = stores.get(`agente/${hashVault("C:/vault")}/participacao.json`);
    expect(arquivo?.get("dados")).toEqual({
      version: 1,
      dados: { "Nota.md": "aceito" },
    });
  });

  it("recusar silencia a nota para sempre: nenhum gateiro novo por tecla", async () => {
    vi.useFakeTimers();
    vi.mocked(completar).mockImplementation(async (p) => respostaPorPapel(p));
    notaAberta.conteudoEditor = "x".repeat(500);
    await st().aplicarConfig(CONFIG);
    await st().aoAbrirVault("C:/vault");
    await vi.advanceTimersByTimeAsync(6000);
    st().responderConvite("recusar");
    const chamadasAteAqui = vi.mocked(completar).mock.calls.length;

    await vi.advanceTimersByTimeAsync(30_000);

    expect(vi.mocked(completar)).toHaveBeenCalledTimes(chamadasAteAqui);
    expect(st().participacao["Nota.md"]).toBe("recusado");
    expect(st().convite).toBeNull();
  });

  it("com aceite, inatividade sem conteúdo novo não gasta chamada", async () => {
    vi.useFakeTimers();
    vi.mocked(completar).mockImplementation(async (p) => respostaPorPapel(p));
    notaAberta.conteudoEditor = "x".repeat(500);
    await st().aplicarConfig(CONFIG);
    await st().aoAbrirVault("C:/vault");
    await vi.advanceTimersByTimeAsync(6000);
    st().responderConvite("aceitar");
    await vi.advanceTimersByTimeAsync(10);
    const aposCiclo = vi.mocked(completar).mock.calls.length;

    await vi.advanceTimersByTimeAsync(60_000); // nada foi digitado

    expect(vi.mocked(completar)).toHaveBeenCalledTimes(aposCiclo);
  });

  it("dispensar remove só a sugestão indicada", async () => {
    vi.useFakeTimers();
    vi.mocked(completar).mockImplementation(async (p) => respostaPorPapel(p));
    notaAberta.conteudoEditor = "x".repeat(500);
    await st().aplicarConfig(CONFIG);
    await st().aoAbrirVault("C:/vault");
    await vi.advanceTimersByTimeAsync(6000);
    st().responderConvite("aceitar");
    await vi.advanceTimersByTimeAsync(10);
    const id = st().sugestoes["Nota.md"][0].id;

    st().dispensarSugestao(id);

    expect(st().sugestoes["Nota.md"]).toEqual([]);
  });

  it("rename migra participação, sugestões e convite (doc 11 §2.2)", async () => {
    await st().aplicarConfig(CONFIG);
    await st().aoAbrirVault("C:/vault");
    useAgenteStore.setState({
      participacao: { "antigo.md": "recusado" },
      sugestoes: { "antigo.md": [{ id: "s1", tipo: "pergunta", texto: "x" }] },
      convite: { path: "antigo.md", tema: "t" },
    });

    st().migrarParticipacao("antigo.md", "novo.md");

    expect(st().participacao).toEqual({ "novo.md": "recusado" });
    expect(st().sugestoes["novo.md"]).toHaveLength(1);
    expect(st().convite).toEqual({ path: "novo.md", tema: "t" });
  });
});

// ——— fase 4: fatos, conversas persistidas, limpeza ———

describe("agenteStore — memória de longo prazo", () => {
  it("novosFatos do ciclo entram no estado e vão pro fatos.json", async () => {
    vi.useFakeTimers();
    vi.mocked(completar).mockImplementation(async (p) => {
      if (p.system.startsWith("Você analisa notas")) {
        return {
          texto: '{"valeParticipar": true, "tema": "infra", "confianca": 0.9}',
          uso: { tokensEntrada: 5, tokensSaida: 5 },
        };
      }
      return {
        texto: '{"sugestoes":[],"novosFatos":["o autor chama o backend de Core"]}',
        uso: { tokensEntrada: 10, tokensSaida: 5 },
      };
    });
    notaAberta.conteudoEditor = "x".repeat(500);
    await st().aplicarConfig(CONFIG);
    await st().aoAbrirVault("C:/vault");
    await vi.advanceTimersByTimeAsync(6000);
    st().responderConvite("aceitar");
    await vi.advanceTimersByTimeAsync(10);

    expect(st().fatos).toHaveLength(1);
    expect(st().fatos[0].texto).toBe("o autor chama o backend de Core");
    expect(st().fatos[0].notaOrigem).toBe("Nota.md");

    await vi.advanceTimersByTimeAsync(1500);
    const arquivo = stores.get(`agente/${hashVault("C:/vault")}/fatos.json`);
    const gravados = (arquivo?.get("dados") as { dados: unknown[] }).dados;
    expect(gravados).toHaveLength(1);
  });

  it("apagarFato remove o fato", async () => {
    await st().aplicarConfig(CONFIG);
    await st().aoAbrirVault("C:/vault");
    useAgenteStore.setState({
      fatos: [{ id: "f-1", texto: "fato", notaOrigem: null, criadoEm: "2026-09-13" }],
    });

    st().apagarFato("f-1");

    expect(st().fatos).toEqual([]);
  });

  it("conversa sobrevive a reabertura do vault", async () => {
    await st().aplicarConfig(CONFIG);
    await st().aoAbrirVault("C:/vault");
    await st().enviarMensagem("pergunta real");

    // espera o debounce de 1 s do agendarPersistirConversas gravar de fato
    await vi.waitFor(
      () => {
        const arq = stores.get(`agente/${hashVault("C:/vault")}/conversas.json`);
        const dados = (arq?.get("dados") as { dados: Record<string, unknown> } | undefined)?.dados;
        expect((dados?.["Nota.md"] as { mensagens: unknown[] } | undefined)?.mensagens).toHaveLength(2);
      },
      { timeout: 3000 },
    );

    await st().aoAbrirVault("C:/vault"); // reabre o vault

    expect(st().conversas["Nota.md"][0].texto).toBe("pergunta real");
    expect(st().conversas["Nota.md"][1].texto).toBe("resposta do modelo");
  });

  it("limparMemoria esvazia estado e disco (doc 11 §6.3)", async () => {
    await st().aplicarConfig(CONFIG);
    await st().aoAbrirVault("C:/vault");
    await st().enviarMensagem("oi");
    await vi.waitFor(() => expect(st().conversas["Nota.md"]).toHaveLength(2));
    useAgenteStore.setState({
      participacao: { "n.md": "recusado" },
      fatos: [{ id: "f-1", texto: "fato", notaOrigem: null, criadoEm: "x" }],
    });

    await st().limparMemoria();

    expect(st().participacao).toEqual({});
    expect(st().fatos).toEqual([]);
    expect(st().conversas).toEqual({});
    const arquivo = stores.get(`agente/${hashVault("C:/vault")}/participacao.json`);
    expect((arquivo?.get("dados") as { dados: unknown }).dados).toEqual({});
  });
});
