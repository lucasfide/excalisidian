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

const emitMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock("@tauri-apps/api/event", () => ({
  emit: (...args: unknown[]) => emitMock(...args),
}));

vi.mock("../agente/cliente", () => ({
  completar: vi.fn(async () => ({
    texto: "resposta do modelo",
    uso: { tokensEntrada: 40, tokensSaida: 8 },
  })),
  listarModelos: vi.fn(async () => ["gpt-5.6-luna", "gpt-5.4-mini"]),
  textoDoErro: vi.fn(() => "erro simulado"),
}));

const { buscarSaldoMock } = vi.hoisted(() => ({ buscarSaldoMock: vi.fn() }));
vi.mock("../servico/saldoCreditos", () => ({
  buscarSaldoCreditos: (...a: unknown[]) => buscarSaldoMock(...a),
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
const { dispararConta } = vi.hoisted(() => ({
  dispararConta: { lista: [] as Array<(s: unknown, p: unknown) => void> },
}));
const { sincronizarMock } = vi.hoisted(() => ({ sincronizarMock: vi.fn(async () => {}) }));
vi.mock("./contaStore", () => ({
  useContaStore: {
    getState: () => ({ sincronizarComCofre: sincronizarMock }),
    subscribe: (cb: (s: unknown, p: unknown) => void) => {
      dispararConta.lista.push(cb);
      return () => {
        const i = dispararConta.lista.indexOf(cb);
        if (i >= 0) dispararConta.lista.splice(i, 1);
      };
    },
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
import { completar, listarModelos } from "../agente/cliente";
import { FalhaAgente } from "../agente/tipos";
import type { ConfigAgente } from "../agente/tipos";
import { BASE_URL_SERVICO } from "../servico/base";
import { MODELO_LEITURA } from "../agente/provedores";
import { definirTokenDaSessao } from "../servico/sessao";

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
  emitMock.mockClear();
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
    analises: {},
    sugestoes: {},
    fatos: [],
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
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

  // Doc 12 §6: config do agente é preferência compartilhada — outras janelas recarregam ao
  // receber este evento (flushEntreJanelas.ts cuida da metade "recebe").
  it("aplicarConfig avisa as outras janelas via app://prefs-mudou", async () => {
    await st().aplicarConfig(CONFIG);
    expect(emitMock).toHaveBeenCalledWith("app://prefs-mudou");
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

  it("carregar rejeita config com provedor fora do catálogo e cai no padrão", async () => {
    await st().aplicarConfig(CONFIG);
    const store = stores.get("settings.json")!;
    await store.set("agente", { ...CONFIG, provedor: "desconhecido" });
    useAgenteStore.setState({ config: null, carregado: false });

    await st().carregar();

    expect(st().config).toBeNull();
    expect(st().carregado).toBe(true);
  });

  it("testarConexao: null quando o provedor responde, mensagem quando falha", async () => {
    await st().aplicarConfig(CONFIG);
    expect(await st().testarConexao()).toBeNull();

    const { listarModelos } = await import("../agente/cliente");
    vi.mocked(listarModelos).mockRejectedValueOnce(new Error("sem rede"));
    expect(await st().testarConexao()).toBe("erro simulado");
  });

  it("testar conexão do provedor próprio falha sem sessão com o texto traduzido, não o código cru", async () => {
    definirTokenDaSessao(null);
    const { textoDoErro } = await import("../agente/cliente");
    vi.mocked(textoDoErro).mockClear();
    const erro = await useAgenteStore.getState().testarConexao({
      ...CONFIG,
      provedor: "excalisidian",
      chaves: {},
      baseUrls: { excalisidian: BASE_URL_SERVICO },
      modeloGateiro: MODELO_LEITURA,
    });
    // textoDoErro (mockado no topo do arquivo) é o mesmo mecanismo dos outros ramos de
    // testarConexao — precisa ser chamado com o erro de sessão, e o retorno tem que ser o
    // texto traduzido que ele devolve, nunca o código cru "sessao".
    expect(textoDoErro).toHaveBeenCalledWith(expect.objectContaining({ codigo: "sessao" }));
    expect(erro).toBe("erro simulado");
    expect(erro).not.toBe("sessao");
  });

  it("testar conexão do provedor próprio não chama listarModelos", async () => {
    definirTokenDaSessao("tok-valido");
    vi.mocked(listarModelos).mockClear();
    await useAgenteStore.getState().testarConexao({
      ...CONFIG,
      provedor: "excalisidian",
      chaves: {},
      baseUrls: { excalisidian: BASE_URL_SERVICO },
      modeloGateiro: MODELO_LEITURA,
    });
    expect(listarModelos).not.toHaveBeenCalled();
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

  it("gateiro que decide 'não vale' registra a decisão visível, sem convite", async () => {
    vi.useFakeTimers();
    vi.mocked(completar).mockImplementation(async () => ({
      texto: '{"valeParticipar": false, "tema": "lista de compras", "confianca": 0.9}',
      uso: { tokensEntrada: 5, tokensSaida: 5 },
    }));
    notaAberta.conteudoEditor = "x".repeat(500);
    await st().aplicarConfig(CONFIG);
    await st().aoAbrirVault("C:/vault");
    await vi.advanceTimersByTimeAsync(6000);

    expect(st().convite).toBeNull();
    expect(st().analises["Nota.md"]).toBe("nao-vale");
  });

  it("gateiro que falha marca 'erro' e tenta de novo no próximo repouso (pane não consome a espera)", async () => {
    vi.useFakeTimers();
    vi.mocked(completar).mockRejectedValue(new Error("sem rede"));
    notaAberta.conteudoEditor = "x".repeat(500);
    await st().aplicarConfig(CONFIG);
    await st().aoAbrirVault("C:/vault");

    await vi.advanceTimersByTimeAsync(6000);
    expect(st().analises["Nota.md"]).toBe("erro");
    const aposPrimeira = vi.mocked(completar).mock.calls.length;

    await vi.advanceTimersByTimeAsync(6000); // outro repouso: tenta de novo
    expect(vi.mocked(completar).mock.calls.length).toBeGreaterThan(aposPrimeira);
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

// ——— erro definitivo (sessao/plano) para o agente de tentar; erro transitório não ———

describe("agenteStore — para de tentar depois de um erro definitivo", () => {
  it("depois de um erro 'plano', nenhum novo ciclo é agendado", async () => {
    vi.useFakeTimers();
    vi.mocked(completar).mockRejectedValue(new FalhaAgente("plano"));
    notaAberta.conteudoEditor = "x".repeat(500);
    await st().aplicarConfig(CONFIG);
    await st().aoAbrirVault("C:/vault");
    st().conectarGatilhos();

    await vi.advanceTimersByTimeAsync(6000);
    expect(st().status).toBe("erro");
    expect(st().erroAtual).toBe("erro simulado");
    const chamadasAteAqui = vi.mocked(completar).mock.calls.length;

    await vi.advanceTimersByTimeAsync(60_000); // vários repousos depois

    expect(vi.mocked(completar)).toHaveBeenCalledTimes(chamadasAteAqui);
  });

  it("depois de um erro 'sessao', mudança de sessão no contaStore tira o agente do erro e volta a agendar", async () => {
    vi.useFakeTimers();
    vi.mocked(completar).mockRejectedValue(new FalhaAgente("sessao"));
    notaAberta.conteudoEditor = "x".repeat(500);
    await st().aplicarConfig(CONFIG);
    await st().aoAbrirVault("C:/vault");
    st().conectarGatilhos();

    await vi.advanceTimersByTimeAsync(6000);
    expect(st().status).toBe("erro");
    const chamadasAntes = vi.mocked(completar).mock.calls.length;

    // sessão mudou (por exemplo, o usuário entrou na conta): o gateiro volta a funcionar.
    vi.mocked(completar).mockImplementation(async (p) => respostaPorPapel(p));
    for (const cb of dispararConta.lista) {
      cb({ sessao: { token: "novo-token" } }, { sessao: null });
    }

    expect(st().status).not.toBe("erro");
    expect(st().erroAtual).toBeNull();

    await vi.advanceTimersByTimeAsync(6000);

    expect(vi.mocked(completar).mock.calls.length).toBeGreaterThan(chamadasAntes);
  });

  it("erro NÃO definitivo (rede) continua reagendando normalmente — não regride", async () => {
    vi.useFakeTimers();
    vi.mocked(completar).mockRejectedValue(new Error("sem rede"));
    notaAberta.conteudoEditor = "x".repeat(500);
    await st().aplicarConfig(CONFIG);
    await st().aoAbrirVault("C:/vault");
    st().conectarGatilhos();

    await vi.advanceTimersByTimeAsync(6000);
    const aposPrimeira = vi.mocked(completar).mock.calls.length;

    await vi.advanceTimersByTimeAsync(6000); // outro repouso: continua tentando

    expect(vi.mocked(completar).mock.calls.length).toBeGreaterThan(aposPrimeira);
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

// ——— novas tentativas com espera crescente e pausa por créditos (plano 15, tarefa 2) ———

const CONFIG_PROPRIA: ConfigAgente = {
  ...CONFIG,
  provedor: "excalisidian",
  chaves: {},
  baseUrls: { excalisidian: BASE_URL_SERVICO },
  modeloGateiro: MODELO_LEITURA,
};

async function prepararNota(config: ConfigAgente = CONFIG) {
  vi.useFakeTimers();
  notaAberta.conteudoEditor = "x".repeat(500);
  await st().aplicarConfig(config);
  await st().aoAbrirVault("C:/vault");
  st().conectarGatilhos();
}

describe("agenteStore — espera crescente entre falhas", () => {
  it("gateiro: duas falhas seguidas esperam 5 s e depois 30 s", async () => {
    vi.mocked(completar).mockRejectedValue(new Error("sem rede"));
    await prepararNota();

    await vi.advanceTimersByTimeAsync(5_100); // 1ª tentativa (inatividade de 5 s)
    expect(completar).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5_000); // espera de 5 s → 2ª tentativa
    expect(completar).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(29_000); // ainda dentro dos 30 s
    expect(completar).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1_500); // passou dos 30 s → 3ª tentativa
    expect(completar).toHaveBeenCalledTimes(3);
  });

  it("gateiro: depois das quatro esperas desiste até a nota crescer 50%", async () => {
    vi.mocked(completar).mockRejectedValue(new Error("sem rede"));
    await prepararNota();

    await vi.advanceTimersByTimeAsync(20 * 60_000);
    const chamadas = vi.mocked(completar).mock.calls.length;
    expect(chamadas).toBe(5);

    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(completar).toHaveBeenCalledTimes(chamadas);
  });

  it("gateiro: veredito válido depois de uma falha convida normalmente", async () => {
    vi.mocked(completar).mockRejectedValueOnce(new Error("sem rede"));
    vi.mocked(completar).mockImplementation(async (p) => respostaPorPapel(p));
    await prepararNota();

    await vi.advanceTimersByTimeAsync(11_000);
    expect(completar).toHaveBeenCalledTimes(2);
    expect(st().convite).not.toBeNull();
  });

  it("ciclo: falhas seguidas não repetem a cada 10 s; a 3ª rodada espera 30 s", async () => {
    vi.mocked(completar).mockRejectedValue(new Error("sem rede"));
    await prepararNota();
    useAgenteStore.setState({ participacao: { "Nota.md": "aceito" } });
    for (const f of dispararDocs.lista) f();

    await vi.advanceTimersByTimeAsync(10_100); // 1ª falha do ciclo
    const primeira = vi.mocked(completar).mock.calls.length;
    expect(primeira).toBeGreaterThan(0);

    await vi.advanceTimersByTimeAsync(10_000); // 2ª rodada (espera 5 s < inatividade 10 s)
    const segunda = vi.mocked(completar).mock.calls.length;
    expect(segunda).toBeGreaterThan(primeira);

    await vi.advanceTimersByTimeAsync(20_000); // a 3ª só depois de 30 s
    expect(vi.mocked(completar).mock.calls.length).toBe(segunda);
    await vi.advanceTimersByTimeAsync(11_000);
    expect(vi.mocked(completar).mock.calls.length).toBeGreaterThan(segunda);
  });
});

describe("agenteStore — créditos esgotados pausam o segundo plano", () => {
  it("gateiro com 'creditos': erro visível e nenhuma chamada nova, mesmo com o tempo passando", async () => {
    vi.mocked(completar).mockRejectedValue(new FalhaAgente("creditos"));
    await prepararNota(CONFIG_PROPRIA);

    await vi.advanceTimersByTimeAsync(6_000);
    expect(st().status).toBe("erro");
    expect(st().erroAtual).toBe("erro simulado");
    const chamadas = vi.mocked(completar).mock.calls.length;

    await vi.advanceTimersByTimeAsync(25 * 60_000);
    expect(completar).toHaveBeenCalledTimes(chamadas);
  });

  it("mudança de sessão tira da pausa e o gateiro volta", async () => {
    vi.mocked(completar).mockRejectedValue(new FalhaAgente("creditos"));
    await prepararNota(CONFIG_PROPRIA);
    await vi.advanceTimersByTimeAsync(6_000);
    const antes = vi.mocked(completar).mock.calls.length;

    vi.mocked(completar).mockImplementation(async (p) => respostaPorPapel(p));
    for (const cb of dispararConta.lista) cb({ sessao: { token: "novo" } }, { sessao: null });
    await vi.advanceTimersByTimeAsync(6_000);

    expect(vi.mocked(completar).mock.calls.length).toBeGreaterThan(antes);
  });

  it("saldo com créditos (usados < total) tira da pausa", async () => {
    vi.mocked(completar).mockRejectedValue(new FalhaAgente("creditos"));
    await prepararNota(CONFIG_PROPRIA);
    await vi.advanceTimersByTimeAsync(6_000);
    const antes = vi.mocked(completar).mock.calls.length;

    vi.stubEnv("VITE_SERVIDOR", "real"); // fora do modo local de DEV, o saldo é buscado
    definirTokenDaSessao("tok");
    buscarSaldoMock.mockResolvedValue({ usados: 10, total: 100, renovaEm: 1 });
    vi.mocked(completar).mockImplementation(async (p) => respostaPorPapel(p));
    await st().atualizarSaldo();
    await vi.advanceTimersByTimeAsync(6_000);

    expect(vi.mocked(completar).mock.calls.length).toBeGreaterThan(antes);
  });

  it("durante a pausa, o timer de 30 min consulta o saldo", async () => {
    vi.mocked(completar).mockRejectedValue(new FalhaAgente("creditos"));
    vi.stubEnv("VITE_SERVIDOR", "real");
    definirTokenDaSessao("tok");
    buscarSaldoMock.mockReset();
    buscarSaldoMock.mockResolvedValue({ usados: 100, total: 100, renovaEm: 1 });
    await prepararNota(CONFIG_PROPRIA);
    await vi.advanceTimersByTimeAsync(6_000);
    buscarSaldoMock.mockClear();

    await vi.advanceTimersByTimeAsync(31 * 60_000);
    expect(buscarSaldoMock.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("o chat continua permitido durante a pausa e uma resposta boa sai dela", async () => {
    vi.mocked(completar).mockRejectedValue(new FalhaAgente("creditos"));
    await prepararNota(CONFIG_PROPRIA);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(st().status).toBe("erro");

    vi.mocked(completar).mockImplementation(async (p) => respostaPorPapel(p));
    await st().enviarMensagem("oi");
    expect(st().erroAtual).toBeNull();
    expect(st().status).not.toBe("erro");
  });

  it("chat com 'creditos' entra na pausa e para o segundo plano", async () => {
    await prepararNota(CONFIG_PROPRIA);
    vi.mocked(completar).mockReset();
    vi.mocked(completar).mockRejectedValue(new FalhaAgente("creditos"));
    await st().enviarMensagem("oi");
    expect(st().status).toBe("erro");
    const chamadas = vi.mocked(completar).mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(completar).toHaveBeenCalledTimes(chamadas);
  });
});

// ——— sessão trocada por outra janela (plano 15, tarefa 3) ———

describe("agenteStore — 401 com token trocado por outra janela", () => {
  beforeEach(() => {
    sincronizarMock.mockReset();
    sincronizarMock.mockImplementation(async () => {});
    definirTokenDaSessao("tok-velho");
  });

  it("chat: 401, o cofre tem outro token, repete UMA vez e dá certo sem erro", async () => {
    await prepararNota(CONFIG_PROPRIA);
    vi.mocked(completar).mockReset();
    sincronizarMock.mockImplementation(async () => definirTokenDaSessao("tok-novo"));
    vi.mocked(completar)
      .mockRejectedValueOnce(new FalhaAgente("sessao"))
      .mockImplementation(async (p) => respostaPorPapel(p));

    await st().enviarMensagem("oi");

    expect(sincronizarMock).toHaveBeenCalledTimes(1);
    expect(completar).toHaveBeenCalledTimes(2);
    expect(st().erroAtual).toBeNull();
    expect(st().status).not.toBe("erro");
  });

  it("chat: 401 e o token continua o mesmo, vira erro sem repetir", async () => {
    await prepararNota(CONFIG_PROPRIA);
    vi.mocked(completar).mockReset();
    vi.mocked(completar).mockRejectedValue(new FalhaAgente("sessao"));

    await st().enviarMensagem("oi");

    expect(sincronizarMock).toHaveBeenCalledTimes(1);
    expect(completar).toHaveBeenCalledTimes(1);
    expect(st().status).toBe("erro");
  });

  it("chat: 401 de novo depois da repetição vira erro (só repete uma vez)", async () => {
    await prepararNota(CONFIG_PROPRIA);
    vi.mocked(completar).mockReset();
    sincronizarMock.mockImplementation(async () => definirTokenDaSessao("tok-novo"));
    vi.mocked(completar).mockRejectedValue(new FalhaAgente("sessao"));

    await st().enviarMensagem("oi");

    expect(completar).toHaveBeenCalledTimes(2);
    expect(st().status).toBe("erro");
  });

  it("chat: sessão zerada pela outra janela (sem token) vira erro sem repetir", async () => {
    await prepararNota(CONFIG_PROPRIA);
    vi.mocked(completar).mockReset();
    sincronizarMock.mockImplementation(async () => definirTokenDaSessao(null));
    vi.mocked(completar).mockRejectedValue(new FalhaAgente("sessao"));

    await st().enviarMensagem("oi");

    expect(completar).toHaveBeenCalledTimes(1);
    expect(st().status).toBe("erro");
  });

  it("provedor de chave própria não consulta o cofre num 401", async () => {
    await prepararNota(CONFIG);
    vi.mocked(completar).mockReset();
    vi.mocked(completar).mockRejectedValue(new FalhaAgente("sessao"));

    await st().enviarMensagem("oi");

    expect(sincronizarMock).not.toHaveBeenCalled();
    expect(completar).toHaveBeenCalledTimes(1);
  });

  it("gateiro: o mesmo caminho vale para o segundo plano", async () => {
    sincronizarMock.mockImplementation(async () => definirTokenDaSessao("tok-novo"));
    vi.mocked(completar).mockRejectedValueOnce(new FalhaAgente("sessao"));
    vi.mocked(completar).mockImplementation(async (p) => respostaPorPapel(p));
    await prepararNota(CONFIG_PROPRIA);
    await vi.advanceTimersByTimeAsync(6_000);

    expect(sincronizarMock).toHaveBeenCalledTimes(1);
    expect(completar).toHaveBeenCalledTimes(2); // a repetição aconteceu de fato
    expect(st().status).not.toBe("erro");
  });
});
