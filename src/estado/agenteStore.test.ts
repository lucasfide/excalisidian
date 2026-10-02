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

const { buscarSaldoMock, consultarMock } = vi.hoisted(() => ({ buscarSaldoMock: vi.fn(), consultarMock: vi.fn() }));
vi.mock("../servico/saldoCreditos", () => ({
  buscarSaldoCreditos: (...a: unknown[]) => buscarSaldoMock(...a),
  consultarCreditos: (...a: unknown[]) => consultarMock(...a),
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
const backlinksTeste = new Map<string, { origem: string }[]>();
vi.mock("./vaultStore", () => ({
  useVaultStore: {
    getState: () => ({
      adapter: { lerTexto: async (p: string) => indice.get(p)?.title ?? "conteudo de " + p },
      indice,
      links: { backlinks: backlinksTeste, naoResolvidos: new Map() },
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
    enviandoChat: false,
    caminhoChatEmVoo: null,
    erroAtual: null,
    erroDeSessao: false,
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
    novidades: {},
    atividades: {},
    versoesNovidadeSugestoes: {},
    versaoNovidadeMemoria: 0,
    versoesVistasSugestoes: {},
    versaoMemoriaVista: 0,
    fatos: [],
    saldoCreditos: null,
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
    expect(st().novidades["Nota.md"]).toEqual({ sugestoes: false, resposta: true });
    expect(st().usoSessao).toEqual({ tokensEntrada: 40, tokensSaida: 8 });
  });

  it("texto vazio não envia; pausar acompanhamento mantém o chat manual disponível", async () => {
    await st().aplicarConfig(CONFIG);
    await st().enviarMensagem("   ");
    expect(completar).not.toHaveBeenCalled();

    st().pausar();
    await st().enviarMensagem("agora?");
    expect(completar).toHaveBeenCalledTimes(1);
    expect(st().pausado).toBe(true);
  });

  it("falha do provedor: erro visível no estado, sem exceção para fora (RF11.15)", async () => {
    vi.mocked(completar).mockRejectedValueOnce(new Error("boom"));
    await st().aplicarConfig(CONFIG);

    await st().enviarMensagem("oi");

    expect(st().status).toBe("erro");
    expect(st().erroAtual).toBe("erro simulado");
    expect(st().erroDeSessao).toBe(false);
    expect(st().conversas["Nota.md"][0]).toEqual({ papel: "usuario", texto: "oi" });
    expect(st().novidades["Nota.md"]).toBeUndefined();
  });

  it("mensagem com mais de 100 mil caracteres não é enviada e avisa; devolve 'longa'", async () => {
    await st().aplicarConfig(CONFIG);
    const r = await st().enviarMensagem("a".repeat(100_001));
    expect(r).toBe("longa");
    expect(completar).not.toHaveBeenCalled();
    expect(st().conversas["Nota.md"] ?? []).toEqual([]);
    expect(st().erroAtual).toBe("Mensagem longa demais para o agente (máximo de 100 mil caracteres).");
    expect(st().erroDeSessao).toBe(false);
  });

  it("mensagem com exatamente 100 mil caracteres ainda é enviada", async () => {
    await st().aplicarConfig(CONFIG);
    const r = await st().enviarMensagem("a".repeat(100_000));
    expect(r).toBeUndefined();
    expect(completar).toHaveBeenCalledTimes(1);
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
    consultarMock.mockResolvedValue({ ok: true, saldo: { usados: 1, total: 10, renovaEm: 1 } });
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
  it("atividade do gateiro não apaga atividade paralela de conversa", async () => {
    vi.useFakeTimers();
    let concluirGateiro: (resposta: { texto: string; uso: { tokensEntrada: number; tokensSaida: number } }) => void = () => {};
    let concluirChat: (resposta: { texto: string; uso: { tokensEntrada: number; tokensSaida: number } }) => void = () => {};
    vi.mocked(completar).mockImplementation((pedido) => {
      if (pedido.system.startsWith("Você analisa notas")) {
        return new Promise((resolve) => void (concluirGateiro = resolve));
      }
      return new Promise((resolve) => void (concluirChat = resolve));
    });
    notaAberta.conteudoEditor = "x".repeat(500);
    await st().aplicarConfig(CONFIG);
    await st().aoAbrirVault("C:/vault");
    await vi.advanceTimersByTimeAsync(6000);

    const atividadeGateiro = Object.values(st().atividades)[0];
    expect(atividadeGateiro?.fase).toBe("leitura-inicial");
    const mensagem = st().enviarMensagem("oi");
    const atividades = Object.values(st().atividades);
    expect(atividades).toHaveLength(2);
    expect(atividades.some((atividade) => atividade.fase === "respondendo")).toBe(true);

    concluirGateiro({
      texto: '{"valeParticipar": true, "tema": "arquitetura", "confianca": 0.9}',
      uso: { tokensEntrada: 1, tokensSaida: 1 },
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(Object.values(st().atividades)).toHaveLength(1);
    expect(Object.values(st().atividades)[0]?.fase).toBe("respondendo");

    concluirChat({ texto: "resposta", uso: { tokensEntrada: 1, tokensSaida: 1 } });
    await mensagem;
    expect(st().atividades).toEqual({});
  });

  it("aceite de nota curta executa um primeiro ciclo e reconhece a versão consultada", async () => {
    vi.useFakeTimers();
    vi.mocked(completar).mockImplementation(async (p) => respostaPorPapel(p));
    notaAberta.conteudoEditor = "x".repeat(150);
    await st().aplicarConfig(CONFIG);
    await st().aoAbrirVault("C:/vault");
    await vi.advanceTimersByTimeAsync(6000);
    expect(st().convite).not.toBeNull();

    st().responderConvite("aceitar");
    await vi.advanceTimersByTimeAsync(0);
    expect(completar).toHaveBeenCalledTimes(2);
    expect(st().sugestoes["Nota.md"]).toHaveLength(1);
    expect(st().versoesNovidadeSugestoes["Nota.md"]).toBe(1);

    st().reconhecerSugestoes("Nota.md", 1);
    useAgenteStore.setState({ versoesNovidadeSugestoes: { "Nota.md": 2 } });
    expect(st().versoesVistasSugestoes["Nota.md"]).toBe(1);
    expect(st().versoesNovidadeSugestoes["Nota.md"]).toBe(2);

    const chamadas = vi.mocked(completar).mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(completar).toHaveBeenCalledTimes(chamadas);
  });

  it("ciclo aparece na conversa no mesmo bloco, conclui esse bloco e envia só mensagens reais ao chat", async () => {
    vi.useFakeTimers();
    const controleCiclo: { concluir?: (resposta: { texto: string; uso: { tokensEntrada: number; tokensSaida: number } }) => void } = {};
    vi.mocked(completar).mockImplementation((pedido) => {
      if (pedido.system.startsWith("Você analisa notas")) {
        return Promise.resolve({
          texto: '{"valeParticipar":true,"tema":"arquitetura","confianca":0.9}',
          uso: { tokensEntrada: 1, tokensSaida: 1 },
        });
      }
      if (pedido.system.includes("acompanhando a nota")) {
        return new Promise((resolve) => { controleCiclo.concluir = resolve; });
      }
      return Promise.resolve({ texto: "resposta do chat", uso: { tokensEntrada: 1, tokensSaida: 1 } });
    });
    notaAberta.conteudoEditor = "x".repeat(500);
    await st().aplicarConfig(CONFIG);
    await st().aoAbrirVault("C:/vault");
    await vi.advanceTimersByTimeAsync(6000);
    st().responderConvite("aceitar");
    await vi.advanceTimersByTimeAsync(0);

    const emAndamento = st().conversas["Nota.md"].find((mensagem) => mensagem.tipo === "analise");
    expect(emAndamento).toMatchObject({ estado: "em-andamento", fase: "gerando-sugestoes" });
    expect(emAndamento?.id).toBeTruthy();
    controleCiclo.concluir?.({
      texto: '{"sugestoes":[{"tipo":"pergunta","texto":"Falta o prazo?"}],"novosFatos":[]}',
      uso: { tokensEntrada: 1, tokensSaida: 1 },
    });
    await vi.advanceTimersByTimeAsync(0);
    const concluida = st().conversas["Nota.md"].find((mensagem) => mensagem.tipo === "analise");
    expect(concluida?.id).toBe(emAndamento?.id);
    expect(concluida).toMatchObject({ estado: "concluido", sugestoes: [{ texto: "Falta o prazo?" }] });

    await st().enviarMensagem("oi");
    const chamadas = vi.mocked(completar).mock.calls;
    const mensagensEnviadas = chamadas[chamadas.length - 1]?.[0].mensagens;
    expect(mensagensEnviadas?.every((mensagem) => !("tipo" in mensagem))).toBe(true);
    expect(chamadas[chamadas.length - 1]?.[0].system).toContain("Última análise automática — sugestões, não fatos verificados");
    const idSugestao = concluida?.sugestoes?.[0].id;
    if (idSugestao) st().dispensarSugestao(idSugestao);
    expect(st().conversas["Nota.md"].find((mensagem) => mensagem.id === concluida?.id)?.sugestoes).toEqual([]);
    expect(st().sugestoes["Nota.md"]).toEqual([]);
  });

  it("avisa inclusão de candidato estruturado mesmo com 100 fatos legados e ignora repetição", async () => {
    vi.useFakeTimers();
    let ciclos = 0;
    vi.mocked(completar).mockImplementation(async (p) => {
      if (p.system.startsWith("Você analisa notas")) {
        return {
          texto: '{"valeParticipar": true, "tema": "arquitetura", "confianca": 0.9}',
          uso: { tokensEntrada: 1, tokensSaida: 1 },
        };
      }
      ciclos++;
      return {
      texto: '{"sugestoes":[],"novosFatos":[{"categoria":"preferencia","escopo":"vault","chave":"estilo-resposta","texto":"O autor prefere respostas breves.","trechoEvidencia":"O autor prefere respostas breves."}]}',
        uso: { tokensEntrada: 1, tokensSaida: 1 },
      };
    });
    notaAberta.conteudoEditor = "O autor prefere respostas breves. ".repeat(15);
    await st().aplicarConfig(CONFIG);
    await st().aoAbrirVault("C:/vault");
    const fatosAntigos = Array.from({ length: 100 }, (_, indice) => ({
      id: `antigo-${indice}`,
      texto: `Fato antigo ${indice}`,
      notaOrigem: null,
      criadoEm: new Date(indice).toISOString(),
    }));
    useAgenteStore.setState({ fatos: fatosAntigos });
    await vi.advanceTimersByTimeAsync(6000);
    st().responderConvite("aceitar");
    await vi.advanceTimersByTimeAsync(0);

    expect(ciclos).toBe(1);
    expect(st().fatos).toHaveLength(101);
    expect(st().fatos.some((fato) => fato.texto === "O autor prefere respostas breves.")).toBe(true);
    expect(st().fatos.find((fato) => fato.texto === "O autor prefere respostas breves.")?.estado).toBe("pendente");
    expect(st().versaoNovidadeMemoria).toBe(1);

    st().conectarGatilhos();
    notaAberta.conteudoEditor = "y".repeat(900);
    for (const disparar of dispararDocs.lista) disparar();
    await vi.advanceTimersByTimeAsync(11_000);

    expect(ciclos).toBe(2);
    expect(st().versaoNovidadeMemoria).toBe(1);
  });

  it("ciclo inicial curto repete após a espera de falha e para ao esgotar tentativas", async () => {
    vi.useFakeTimers();
    vi.mocked(completar).mockImplementation(async (p) => {
      if (p.system.startsWith("Você analisa notas")) {
        return {
          texto: '{"valeParticipar": true, "tema": "arquitetura", "confianca": 0.9}',
          uso: { tokensEntrada: 1, tokensSaida: 1 },
        };
      }
      throw new Error("sem rede");
    });
    notaAberta.conteudoEditor = "x".repeat(150);
    await st().aplicarConfig(CONFIG);
    await st().aoAbrirVault("C:/vault");
    await vi.advanceTimersByTimeAsync(6000);
    st().responderConvite("aceitar");
    await vi.advanceTimersByTimeAsync(0);
    expect(completar).toHaveBeenCalledTimes(2); // gateiro + primeiro ciclo aceito

    await vi.advanceTimersByTimeAsync(9_999);
    expect(completar).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(completar).toHaveBeenCalledTimes(3); // retry inicial segue o timer/backoff

    await vi.advanceTimersByTimeAsync(30 * 60_000);
    const chamadasAposEsgotar = vi.mocked(completar).mock.calls.length;
    expect(chamadasAposEsgotar).toBe(6); // cinco ciclos no total, além do gateiro
    expect(st().atividades).toEqual({});
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(completar).toHaveBeenCalledTimes(chamadasAposEsgotar);
  });

  it("inatividade dispara o gateiro; convite mantém o painel fechado", async () => {
    vi.useFakeTimers();
    vi.mocked(completar).mockImplementation(async (p) => respostaPorPapel(p));
    notaAberta.conteudoEditor = "x".repeat(500);

    await st().aplicarConfig(CONFIG);
    await st().aoAbrirVault("C:/vault");
    st().conectarGatilhos();
    for (const f of dispararDocs.lista) f(); // simula uma tecla

    await vi.advanceTimersByTimeAsync(6000);

    expect(st().convite).toEqual({ path: "Nota.md", tema: "arquitetura" });
    expect(st().painelAberto).toBe(false);
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

    expect(st().painelAberto).toBe(false); // aceitar com o painel fechado deve sinalizar o ciclo resultante
    st().responderConvite("aceitar");
    await vi.advanceTimersByTimeAsync(10);

    expect(st().sugestoes["Nota.md"]).toHaveLength(1);
    expect(st().sugestoes["Nota.md"][0].texto).toBe("Falta o prazo da entrega?");
    expect(st().novidades["Nota.md"]).toEqual({ sugestoes: true, resposta: false });
    st().reconhecerAtualizacoes("Nota.md");
    expect(st().novidades["Nota.md"]).toBeUndefined();
    expect(st().sugestoes["Nota.md"]).toHaveLength(1);

    const chamadasAntesDoMesmoLote = vi.mocked(completar).mock.calls.length;
    notaAberta.conteudoEditor = "y".repeat(800);
    st().conectarGatilhos();
    for (const disparar of dispararDocs.lista) disparar();
    await vi.advanceTimersByTimeAsync(11_000);
    expect(vi.mocked(completar)).toHaveBeenCalledTimes(chamadasAntesDoMesmoLote + 1);
    expect(st().novidades["Nota.md"]).toBeUndefined();
    expect(st().sugestoes["Nota.md"]).toHaveLength(1);

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
      conversas: {
        "antigo.md": [{ papel: "assistente", texto: "resultado", tipo: "analise", estado: "concluido", sugestoes: [{ id: "s1", tipo: "notaRelacionada", texto: "x", caminhoNota: "antigo.md" }] }],
        "outro.md": [{ papel: "assistente", texto: "referência", tipo: "analise", estado: "concluido", sugestoes: [{ id: "s2", tipo: "notaRelacionada", texto: "x", caminhoNota: "antigo.md" }] }],
      },
      fatos: [{ id: "f1", texto: "preferência", notaOrigem: "antigo.md", criadoEm: "x" }],
      versoesNovidadeSugestoes: { "antigo.md": 2 },
      versoesVistasSugestoes: { "antigo.md": 1 },
      convite: { path: "antigo.md", tema: "t" },
    });

    st().migrarParticipacao("antigo.md", "novo.md");

    expect(st().participacao).toEqual({ "novo.md": "recusado" });
    expect(st().sugestoes["novo.md"]).toHaveLength(1);
    expect(st().conversas["antigo.md"]).toBeUndefined();
    expect(st().conversas["novo.md"][0].sugestoes?.[0].caminhoNota).toBe("novo.md");
    expect(st().conversas["outro.md"][0].sugestoes?.[0].caminhoNota).toBe("novo.md");
    expect(st().fatos[0].notaOrigem).toBe("novo.md");
    expect(st().versoesNovidadeSugestoes).toEqual({ "novo.md": 2 });
    expect(st().versoesVistasSugestoes).toEqual({ "novo.md": 1 });
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
    expect(st().erroDeSessao).toBe(false);
    expect(st().erroAtual).toBe("erro simulado");
    const chamadasAteAqui = vi.mocked(completar).mock.calls.length;

    await vi.advanceTimersByTimeAsync(60_000); // vários repousos depois

    expect(vi.mocked(completar)).toHaveBeenCalledTimes(chamadasAteAqui);
  });

  it("depois de um erro 'sessao', mudança de sessão no contaStore tira o agente do erro e volta a agendar", async () => {
    vi.useFakeTimers();
    vi.mocked(completar).mockRejectedValue(new FalhaAgente("sessao"));
    notaAberta.conteudoEditor = "x".repeat(500);
    await st().aplicarConfig(CONFIG_PROPRIA);
    await st().aoAbrirVault("C:/vault");
    st().conectarGatilhos();

    await vi.advanceTimersByTimeAsync(6000);
    expect(st().status).toBe("erro");
    expect(st().erroDeSessao).toBe(true);
    const chamadasAntes = vi.mocked(completar).mock.calls.length;

    // sessão mudou (por exemplo, o usuário entrou na conta): o gateiro volta a funcionar.
    vi.mocked(completar).mockImplementation(async (p) => respostaPorPapel(p));
    for (const cb of dispararConta.lista) {
      cb({ sessao: { token: "novo-token" } }, { sessao: null });
    }

    expect(st().status).not.toBe("erro");
    expect(st().erroAtual).toBeNull();
    expect(st().erroDeSessao).toBe(false);

    await vi.advanceTimersByTimeAsync(6000);

    expect(vi.mocked(completar).mock.calls.length).toBeGreaterThan(chamadasAntes);
  });

  it("erro de sessão no ciclo marca o sinal tipado e mantém plano como outro erro definitivo", async () => {
    vi.useFakeTimers();
    await prepararNota(CONFIG_PROPRIA);
    useAgenteStore.setState({ participacao: { "Nota.md": "aceito" } });
    vi.mocked(completar).mockRejectedValue(new FalhaAgente("sessao"));
    for (const f of dispararDocs.lista) f();

    await vi.advanceTimersByTimeAsync(10_100);
    expect(st().status).toBe("erro");
    expect(st().erroDeSessao).toBe(true);
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
        texto: '{"sugestoes":[],"novosFatos":[{"categoria":"glossario","escopo":"vault","chave":"backend-core","texto":"o autor chama o backend de Core","trechoEvidencia":"o autor chama o backend de Core"}]}',
        uso: { tokensEntrada: 10, tokensSaida: 5 },
      };
    });
    notaAberta.conteudoEditor = "o autor chama o backend de Core. ".repeat(15);
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

  it("memórias exigem confirmação, permitem edição ou rejeição, e preferência explícita salva confirmada", async () => {
    await st().aplicarConfig(CONFIG);
    await st().aoAbrirVault("C:/vault");
    useAgenteStore.setState({
      fatos: [{
        id: "f-pendente",
        texto: "resposta curta",
        chave: "estilo-resposta",
        categoria: "preferencia",
        escopo: "vault",
        notaOrigem: "Nota.md",
        trechoEvidencia: "resposta curta",
        criadoEm: "2026-10-01",
        fonte: "nota",
        estado: "pendente",
      }],
    });

    st().confirmarMemoria("f-pendente");
    expect(st().fatos[0].estado).toBe("confirmado");
    st().editarMemoria("f-pendente", "Prefere respostas muito curtas");
    expect(st().fatos[0]).toMatchObject({
      texto: "Prefere respostas muito curtas",
      estado: "confirmado",
      fonte: "usuario",
      notaOrigem: null,
    });

    useAgenteStore.setState({ fatos: [{ ...st().fatos[0], id: "f-rejeitar", estado: "pendente" }] });
    st().rejeitarMemoria("f-rejeitar");
    expect(st().fatos[0].estado).toBe("rejeitado");
    st().lembrarPreferencia("  Prefere texto sem rodeios  ");
    expect(st().fatos[1]).toMatchObject({
      texto: "Prefere texto sem rodeios",
      categoria: "preferencia",
      estado: "confirmado",
      fonte: "usuario",
    });
    await st().enviarMensagem("Como devo responder?");
    expect(vi.mocked(completar).mock.calls[0]?.[0].system).toContain("Dados declarados pelo usuário");
    expect(vi.mocked(completar).mock.calls[0]?.[0].system).toContain("Prefere texto sem rodeios");
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

  it("marca análises persistidas em andamento como interrompidas ao reabrir o vault", async () => {
    await st().aplicarConfig(CONFIG);
    stores.set(`agente/${hashVault("C:/vault")}/conversas.json`, new Map([["dados", {
      version: 1,
      dados: { "Nota.md": {
        atualizadaEm: "2026-10-01",
        mensagens: [{
          id: "analise-em-voo",
          papel: "assistente",
          texto: "Analisando a nota…",
          tipo: "analise",
          estado: "em-andamento",
          fase: "gerando-sugestoes",
        }],
      } },
    }]]));

    await st().aoAbrirVault("C:/vault");

    expect(st().conversas["Nota.md"][0]).toMatchObject({
      id: "analise-em-voo",
      estado: "erro",
      texto: "Análise interrompida ao fechar o aplicativo.",
    });
  });

  it("a 21ª análise de uma nota descarta a mais antiga e mantém as mensagens do chat", async () => {
    vi.useFakeTimers();
    vi.mocked(completar).mockImplementation(async (p) => respostaPorPapel(p));
    notaAberta.conteudoEditor = "x".repeat(150);
    await st().aplicarConfig(CONFIG);
    const analises = Array.from({ length: 20 }, (_, i) => ({
      id: `analise-antiga-${i}`,
      papel: "assistente",
      texto: `análise ${i}`,
      tipo: "analise",
      estado: "concluido",
    }));
    stores.set(`agente/${hashVault("C:/vault")}/conversas.json`, new Map([["dados", {
      version: 1,
      dados: { "Nota.md": {
        atualizadaEm: "2026-10-01",
        mensagens: [{ papel: "usuario", texto: "pergunta do chat" }, ...analises],
      } },
    }]]));
    await st().aoAbrirVault("C:/vault");
    await vi.advanceTimersByTimeAsync(6000);
    st().responderConvite("aceitar");
    await vi.advanceTimersByTimeAsync(0);

    const msgs = st().conversas["Nota.md"];
    const lista = msgs.filter((m) => m.tipo === "analise");
    expect(lista).toHaveLength(20);
    expect(lista.some((m) => m.id === "analise-antiga-0")).toBe(false);
    expect(lista.some((m) => m.id === "analise-antiga-1")).toBe(true);
    expect(msgs[0].texto).toBe("pergunta do chat");
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

describe("agenteStore — resumos do ciclo", () => {
  function prepararVizinhas() {
    backlinksTeste.clear();
    indice.clear();
    const origens = ["A.md", "B.md", "C.md", "D.md"];
    for (const o of origens) {
      indice.set(o, { mtimeMs: 1, size: 1, title: o, outLinks: [], embeds: [] });
    }
    backlinksTeste.set("Nota.md", origens.map((origem) => ({ origem })));
  }

  it("offline: o primeiro resumo com 'rede' interrompe o ciclo — um pedido, não quatro", async () => {
    prepararVizinhas();
    vi.mocked(completar).mockRejectedValue(new FalhaAgente("rede"));
    await prepararNota();
    useAgenteStore.setState({ participacao: { "Nota.md": "aceito" } });
    for (const f of dispararDocs.lista) f();

    await vi.advanceTimersByTimeAsync(10_100);
    expect(completar).toHaveBeenCalledTimes(1);
    backlinksTeste.clear();
    indice.clear();
  });

  it("resumo que falha só por resposta ilegível segue para o trecho cru e o pedido principal", async () => {
    prepararVizinhas();
    vi.mocked(completar).mockRejectedValue(new FalhaAgente("resposta"));
    await prepararNota();
    useAgenteStore.setState({ participacao: { "Nota.md": "aceito" } });
    for (const f of dispararDocs.lista) f();

    await vi.advanceTimersByTimeAsync(10_100);
    // 3 resumos (RESUMOS_POR_CICLO) + o pedido principal
    expect(completar).toHaveBeenCalledTimes(4);
    backlinksTeste.clear();
    indice.clear();
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

  it("limparConversa e retomar não apagam o motivo da pausa por créditos", async () => {
    vi.mocked(completar).mockRejectedValue(new FalhaAgente("creditos"));
    await prepararNota(CONFIG_PROPRIA);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(st().erroAtual).toBe("erro simulado");

    st().limparConversa();
    expect(st().erroAtual).toBe("erro simulado");
    expect(st().status).toBe("erro");

    st().pausar();
    st().retomar();
    expect(st().status).toBe("erro");
    expect(st().erroAtual).toBe("erro simulado");
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
    expect(st().erroDeSessao).toBe(true);
  });

  it("chat: 401 de novo depois da repetição vira erro (só repete uma vez)", async () => {
    await prepararNota(CONFIG_PROPRIA);
    vi.mocked(completar).mockReset();
    sincronizarMock.mockImplementation(async () => definirTokenDaSessao("tok-novo"));
    vi.mocked(completar).mockRejectedValue(new FalhaAgente("sessao"));

    await st().enviarMensagem("oi");

    expect(completar).toHaveBeenCalledTimes(2);
    expect(st().status).toBe("erro");
    expect(st().erroDeSessao).toBe(true);
  });

  it("chat: sessão zerada pela outra janela (sem token) vira erro sem repetir", async () => {
    await prepararNota(CONFIG_PROPRIA);
    vi.mocked(completar).mockReset();
    sincronizarMock.mockImplementation(async () => definirTokenDaSessao(null));
    vi.mocked(completar).mockRejectedValue(new FalhaAgente("sessao"));

    await st().enviarMensagem("oi");

    expect(completar).toHaveBeenCalledTimes(1);
    expect(st().status).toBe("erro");
    expect(st().erroDeSessao).toBe(true);
  });

  it("sinal de sessão some quando o erro atual vira outro erro ou é limpo", async () => {
    await prepararNota(CONFIG_PROPRIA);
    vi.mocked(completar).mockRejectedValueOnce(new FalhaAgente("sessao"));
    await st().enviarMensagem("oi");
    expect(st().erroDeSessao).toBe(true);

    expect(await st().enviarMensagem("x".repeat(100_001))).toBe("longa");
    expect(st().erroDeSessao).toBe(false);

    vi.mocked(completar).mockRejectedValue(new FalhaAgente("creditos"));
    await st().enviarMensagem("outra pergunta");
    expect(st().erroDeSessao).toBe(false);
    useAgenteStore.setState({ novidades: { "Nota.md": { sugestoes: true, resposta: true } } });
    st().limparConversa();
    expect(st().erroDeSessao).toBe(false);
    expect(st().novidades["Nota.md"]).toEqual({ sugestoes: true, resposta: false });
  });

  it("erro de sessão no chat é limpo quando a sessão da conta muda", async () => {
    await prepararNota(CONFIG_PROPRIA);
    vi.mocked(completar).mockRejectedValueOnce(new FalhaAgente("sessao"));
    await st().enviarMensagem("oi");
    expect(st().erroDeSessao).toBe(true);

    for (const callback of dispararConta.lista) {
      callback({ sessao: { token: "tok-novo" } }, { sessao: { token: "tok-velho" } });
    }
    expect(st().erroDeSessao).toBe(false);
    expect(st().erroAtual).toBeNull();
  });

  it("provedor de chave própria não consulta o cofre num 401", async () => {
    await prepararNota(CONFIG);
    vi.mocked(completar).mockReset();
    vi.mocked(completar).mockRejectedValue(new FalhaAgente("sessao"));

    await st().enviarMensagem("oi");

    expect(sincronizarMock).not.toHaveBeenCalled();
    expect(completar).toHaveBeenCalledTimes(1);
    expect(st().erroDeSessao).toBe(false);
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

// ——— saldo sempre atual e "Testar conexão" de verdade (plano 16, tarefa 3) ———

const CONFIG_PROPRIA_T3: ConfigAgente = {
  ...CONFIG,
  provedor: "excalisidian",
  chaves: {},
  baseUrls: { excalisidian: BASE_URL_SERVICO },
  modeloGateiro: MODELO_LEITURA,
};

describe("agenteStore — saldo sem valor velho", () => {
  const umaHora = 3_600_000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("VITE_SERVIDOR", "real");
    definirTokenDaSessao("tok");
    buscarSaldoMock.mockReset();
    consultarMock.mockReset();
    useAgenteStore.setState({ saldoCreditos: null, painelAberto: false });
  });

  it("duas respostas fora de ordem: vale a da chamada mais recente", async () => {
    await st().aplicarConfig(CONFIG_PROPRIA_T3);
    let liberarPrimeira: (v: unknown) => void = () => {};
    buscarSaldoMock.mockImplementationOnce(() => new Promise((r) => (liberarPrimeira = r)));
    buscarSaldoMock.mockResolvedValueOnce({ usados: 2, total: 100, renovaEm: Date.now() + umaHora });
    const primeira = st().atualizarSaldo();
    await st().atualizarSaldo();
    expect(st().saldoCreditos?.usados).toBe(2);
    liberarPrimeira({ usados: 99, total: 100, renovaEm: Date.now() + umaHora });
    await primeira;
    expect(st().saldoCreditos?.usados).toBe(2);
  });

  it("trocar de provedor zera o saldo na hora e descarta resposta em voo", async () => {
    await st().aplicarConfig(CONFIG_PROPRIA_T3);
    buscarSaldoMock.mockResolvedValue({ usados: 10, total: 100, renovaEm: Date.now() + umaHora });
    await st().atualizarSaldo();
    expect(st().saldoCreditos).not.toBeNull();

    let liberar: (v: unknown) => void = () => {};
    buscarSaldoMock.mockImplementationOnce(() => new Promise((r) => (liberar = r)));
    const emVoo = st().atualizarSaldo();
    await st().aplicarConfig(CONFIG);
    expect(st().saldoCreditos).toBeNull();
    liberar({ usados: 10, total: 100, renovaEm: Date.now() + umaHora });
    await emVoo;
    expect(st().saldoCreditos).toBeNull();
  });

  it("desligar o agente zera o saldo e cancela o timer de renovação", async () => {
    await st().aplicarConfig(CONFIG_PROPRIA_T3);
    buscarSaldoMock.mockResolvedValue({ usados: 10, total: 100, renovaEm: Date.now() + umaHora });
    await st().atualizarSaldo();
    await st().definirHabilitado(false);
    expect(st().saldoCreditos).toBeNull();
    buscarSaldoMock.mockClear();
    await vi.advanceTimersByTimeAsync(3 * umaHora);
    expect(buscarSaldoMock).not.toHaveBeenCalled();
  });

  it("mudança de sessão zera o saldo e, com o painel aberto, busca de novo", async () => {
    await st().aplicarConfig(CONFIG_PROPRIA_T3);
    st().conectarGatilhos();
    const renovaEm = Date.now() + umaHora;
    buscarSaldoMock.mockResolvedValue({ usados: 10, total: 100, renovaEm });
    await st().atualizarSaldo();
    useAgenteStore.setState({ painelAberto: true });
    buscarSaldoMock.mockClear();
    buscarSaldoMock.mockResolvedValue({ usados: 50, total: 100, renovaEm });
    for (const cb of dispararConta.lista) cb({ sessao: { token: "novo" } }, { sessao: null });
    expect(st().saldoCreditos).toBeNull();
    await vi.advanceTimersByTimeAsync(0);
    expect(buscarSaldoMock).toHaveBeenCalledTimes(1);
    expect(st().saldoCreditos?.usados).toBe(50);
  });

  it("agenda uma busca para renovaEm + 1 min", async () => {
    await st().aplicarConfig(CONFIG_PROPRIA_T3);
    const renovaEm = Date.now() + 10 * 60_000;
    buscarSaldoMock.mockResolvedValue({ usados: 1, total: 100, renovaEm });
    await st().atualizarSaldo();
    await st().atualizarSaldo(); // saldo novo substitui o timer: continua uma busca só, na hora
    buscarSaldoMock.mockClear();
    buscarSaldoMock.mockResolvedValue({ usados: 0, total: 100, renovaEm: renovaEm + 30 * 24 * umaHora });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(buscarSaldoMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(buscarSaldoMock).toHaveBeenCalledTimes(1);
    expect(st().saldoCreditos?.usados).toBe(0);
  });

  it("renovação a mais de 25 dias não dispara na hora (limite do setTimeout)", async () => {
    await st().aplicarConfig(CONFIG_PROPRIA_T3);
    buscarSaldoMock.mockResolvedValue({ usados: 1, total: 100, renovaEm: Date.now() + 30 * 24 * umaHora });
    await st().atualizarSaldo();
    buscarSaldoMock.mockClear();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(buscarSaldoMock).not.toHaveBeenCalled();
  });
});

describe("agenteStore — testar conexão do provedor próprio consulta o servidor", () => {
  beforeEach(async () => {
    vi.stubEnv("VITE_SERVIDOR", "real");
    consultarMock.mockReset();
    await st().aplicarConfig(CONFIG_PROPRIA_T3);
  });

  async function textoErroMock() {
    const { textoDoErro } = await import("../agente/cliente");
    vi.mocked(textoDoErro).mockClear();
    return textoDoErro;
  }

  it("200: null (sucesso) e o saldo vai para o store", async () => {
    definirTokenDaSessao("tok");
    const saldo = { usados: 3, total: 100, renovaEm: Date.now() + 3_600_000 };
    consultarMock.mockResolvedValue({ ok: true, saldo });
    expect(await st().testarConexao()).toBeNull();
    expect(consultarMock).toHaveBeenCalledWith("tok");
    expect(st().saldoCreditos).toEqual(saldo);
  });

  it("401: texto de sessão, nunca sucesso", async () => {
    definirTokenDaSessao("tok");
    const textoDoErro = await textoErroMock();
    consultarMock.mockResolvedValue({ ok: false, motivo: "sessao" });
    expect(await st().testarConexao()).toBe("erro simulado");
    expect(textoDoErro).toHaveBeenCalledWith(expect.objectContaining({ codigo: "sessao" }));
  });

  it("403: texto de plano", async () => {
    definirTokenDaSessao("tok");
    const textoDoErro = await textoErroMock();
    consultarMock.mockResolvedValue({ ok: false, motivo: "plano" });
    expect(await st().testarConexao()).toBe("erro simulado");
    expect(textoDoErro).toHaveBeenCalledWith(expect.objectContaining({ codigo: "plano" }));
  });

  it("rede: texto de rede", async () => {
    definirTokenDaSessao("tok");
    const textoDoErro = await textoErroMock();
    consultarMock.mockResolvedValue({ ok: false, motivo: "rede" });
    expect(await st().testarConexao()).toBe("erro simulado");
    expect(textoDoErro).toHaveBeenCalledWith(expect.objectContaining({ codigo: "rede" }));
  });

  it("sem token: texto de sessão, sem ir à rede", async () => {
    definirTokenDaSessao(null);
    expect(await st().testarConexao()).toBe("erro simulado");
    expect(consultarMock).not.toHaveBeenCalled();
  });
});

// ——— chat com estado próprio e recarga entre janelas (plano 16, tarefa 4) ———

describe("agenteStore — chat com estado próprio", () => {
  it("resposta de chat em voo não altera estado depois da troca de vault", async () => {
    await st().aplicarConfig(CONFIG);
    let liberar: (v: { texto: string; uso: { tokensEntrada: number; tokensSaida: number } }) => void = () => {};
    vi.mocked(completar).mockImplementationOnce(
      () => new Promise((res) => void (liberar = res)),
    );
    const primeira = st().enviarMensagem("primeira");
    expect(st().enviandoChat).toBe(true);
    expect(st().caminhoChatEmVoo).toBe("Nota.md");
    await st().enviarMensagem("segunda");
    expect(completar).toHaveBeenCalledTimes(1);
    await st().aoAbrirVault("C:/outro-vault");
    expect(st().enviandoChat).toBe(false);
    expect(st().caminhoChatEmVoo).toBeNull();
    liberar({ texto: "resp1", uso: { tokensEntrada: 1, tokensSaida: 1 } });
    await primeira;
    expect(st().enviandoChat).toBe(false);
    expect(st().caminhoChatEmVoo).toBeNull();
    expect(st().conversas).toEqual({});
    expect(st().novidades).toEqual({});
  });

  it("depois de terminar (mesmo com erro), o chat volta a aceitar mensagem", async () => {
    await st().aplicarConfig(CONFIG);
    vi.mocked(completar).mockRejectedValueOnce(new Error("falhou"));
    await st().enviarMensagem("um");
    expect(st().enviandoChat).toBe(false);
    await st().enviarMensagem("dois");
    expect(completar).toHaveBeenCalledTimes(2);
  });

  it("status global baixado no meio da conversa não desliga enviandoChat", async () => {
    await st().aplicarConfig(CONFIG);
    vi.mocked(completar).mockImplementationOnce(() => new Promise(() => {}));
    void st().enviarMensagem("oi");
    useAgenteStore.setState({ status: "ocioso" });
    expect(st().enviandoChat).toBe(true);
  });
});

describe("agenteStore — carregar() entre janelas não apaga o motivo do erro", () => {
  it("com erro definitivo e a mesma config, mantém status e texto do erro", async () => {
    await st().aplicarConfig(CONFIG_PROPRIA);
    vi.mocked(completar).mockRejectedValue(new FalhaAgente("creditos"));
    await st().enviarMensagem("oi");
    expect(st().status).toBe("erro");
    await st().carregar();
    expect(st().status).toBe("erro");
    expect(st().erroAtual).toBe("erro simulado");
  });

  it("com config diferente na outra janela, limpa o erro e sai da pausa", async () => {
    await st().aplicarConfig(CONFIG_PROPRIA);
    vi.mocked(completar).mockRejectedValue(new FalhaAgente("creditos"));
    await st().enviarMensagem("oi");
    expect(st().status).toBe("erro");
    stores.get("settings.json")!.set("agente", { ...CONFIG_PROPRIA, thinking: "alto" });
    await st().carregar();
    expect(st().erroAtual).toBeNull();
    expect(st().status).not.toBe("erro");
    expect(st().config?.thinking).toBe("alto");
  });
});

// ——— ajustes da revisão final (plano 16, tarefa 4) ———

describe("agenteStore — ajustes da revisão final", () => {
  it("carregar() com a mesma config não mexe no status nem no erro visível", async () => {
    await st().aplicarConfig(CONFIG);
    useAgenteStore.setState({ status: "pensando" });
    await st().carregar();
    expect(st().status).toBe("pensando");
    useAgenteStore.setState({ status: "erro", erroAtual: "falha de rede" });
    await st().carregar();
    expect(st().status).toBe("erro");
    expect(st().erroAtual).toBe("falha de rede");
  });

  it("carregar() com a mesma config em outra ordem de chaves conta como igual", async () => {
    await st().aplicarConfig(CONFIG);
    const embaralhada = Object.fromEntries(Object.entries(CONFIG).reverse());
    stores.get("settings.json")!.set("agente", embaralhada);
    useAgenteStore.setState({ status: "erro", erroAtual: "falha de rede" });
    await st().carregar();
    expect(st().erroAtual).toBe("falha de rede");
  });

  it("busca de renovação do saldo espera no mínimo 10 min", async () => {
    vi.useFakeTimers();
    vi.stubEnv("VITE_SERVIDOR", "real");
    definirTokenDaSessao("tok");
    await st().aplicarConfig(CONFIG_PROPRIA);
    buscarSaldoMock.mockReset();
    buscarSaldoMock.mockResolvedValue({ usados: 1, total: 100, renovaEm: 1 });
    await st().atualizarSaldo();
    buscarSaldoMock.mockClear();
    await vi.advanceTimersByTimeAsync(9 * 60_000);
    expect(buscarSaldoMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    expect(buscarSaldoMock).toHaveBeenCalledTimes(1);
  });

  it("mensagem longa na pausa por créditos mantém o motivo da pausa", async () => {
    await prepararNota(CONFIG_PROPRIA);
    vi.mocked(completar).mockRejectedValue(new FalhaAgente("creditos"));
    await vi.advanceTimersByTimeAsync(6_000);
    expect(st().erroAtual).toBe("erro simulado");
    const r = await st().enviarMensagem("x".repeat(100_001));
    expect(r).toBe("longa");
    expect(st().erroAtual).toBe("erro simulado");
  });

  it("testar conexão que falha não descarta uma busca de saldo em voo", async () => {
    vi.stubEnv("VITE_SERVIDOR", "real");
    definirTokenDaSessao("tok");
    await st().aplicarConfig(CONFIG_PROPRIA);
    let liberar: (v: unknown) => void = () => {};
    buscarSaldoMock.mockReset();
    buscarSaldoMock.mockImplementation(() => new Promise((res) => void (liberar = res)));
    const busca = st().atualizarSaldo();
    consultarMock.mockResolvedValue({ ok: false, motivo: "rede" });
    await st().testarConexao();
    liberar({ usados: 5, total: 100, renovaEm: Date.now() + 3_600_000 });
    await busca;
    expect(st().saldoCreditos?.usados).toBe(5);
  });
});
