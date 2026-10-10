// Regressões da auditoria de 12/09/2026, achados 02/03/05: fechar a última aba de um
// documento precisa drenar a fila de gravação (incluindo canvas) ANTES de descartar o
// estado, e nunca descartar em silêncio quando a gravação falha ou há conflito pendente.
import { describe, it, expect, vi, beforeEach } from "vitest";

const salvarAteDrenar = vi.fn();
const fechar = vi.fn();
const abrir = vi.fn(async () => {});
const renomearNoMapa = vi.fn();
vi.mock("./documentosStore", () => ({
  useDocumentosStore: { getState: () => ({ salvarAteDrenar, fechar, abrir, renomearNoMapa }) },
}));

const flusharCanvas = vi.fn(async (_path?: string) => {});
vi.mock("../canvas/flushCanvas", () => ({
  flusharCanvas: (path?: string) => flusharCanvas(path),
}));

const confirmar = vi.fn(async () => false);
vi.mock("./dialogoStore", () => ({
  confirmar: () => confirmar(),
}));

import {
  instalarNavegacaoMobile,
  useWorkspaceStore,
} from "./workspaceStore";
import type { NavegacaoMobile } from "../types/navegacao-mobile";
import { useRevelacaoStore } from "./revelacaoStore";

const ws = () => useWorkspaceStore.getState();

function apiFalsa() {
  return {
    panels: [] as unknown[],
    activePanel: null,
    addPanel: vi.fn(),
    removePanel: vi.fn(),
    getPanel: vi.fn(() => null),
    getGroup: vi.fn(() => null),
  };
}

beforeEach(() => {
  salvarAteDrenar.mockReset();
  fechar.mockReset();
  abrir.mockReset();
  abrir.mockImplementation(async () => {});
  flusharCanvas.mockReset();
  flusharCanvas.mockImplementation(async () => {});
  confirmar.mockReset();
  confirmar.mockImplementation(async () => false);
  useWorkspaceStore.setState({
    api: null,
    caminhoAtivo: null,
    fechadosRecentes: [],
    documentoPendente: null,
  });
  instalarNavegacaoMobile(null);
  useRevelacaoStore.setState({ pendente: null });
});

describe("workspaceStore.aoRemoverPainel — dreno ao fechar aba", () => {
  it("flusha o canvas do caminho antes de drenar o documento (achado 05)", async () => {
    salvarAteDrenar.mockResolvedValue("salvo");

    ws().aoRemoverPainel("D.draw.md", "D.draw.md");
    await vi.waitFor(() => expect(salvarAteDrenar).toHaveBeenCalled());

    expect(flusharCanvas).toHaveBeenCalledWith("D.draw.md");
    expect(flusharCanvas.mock.invocationCallOrder[0]).toBeLessThan(
      salvarAteDrenar.mock.invocationCallOrder[0],
    );
  });

  it("não descarta o documento enquanto o dreno não termina (achado 03)", async () => {
    let resolveDreno!: (r: string) => void;
    salvarAteDrenar.mockImplementation(
      () => new Promise((r) => (resolveDreno = r as never)),
    );

    ws().aoRemoverPainel("Nota.md", "Nota.md");
    await vi.waitFor(() => expect(salvarAteDrenar).toHaveBeenCalled());
    await Promise.resolve();
    expect(fechar).not.toHaveBeenCalled();

    resolveDreno("salvo");
    await vi.waitFor(() => expect(fechar).toHaveBeenCalledWith("Nota.md"));
  });

  it("gravação falha: pergunta e, sem confirmação, reabre a aba em vez de descartar (achado 02)", async () => {
    salvarAteDrenar.mockResolvedValue("erro");
    confirmar.mockResolvedValue(false);
    const api = apiFalsa();
    useWorkspaceStore.setState({ api: api as never });

    ws().aoRemoverPainel("Nota.md", "Nota.md");

    await vi.waitFor(() => expect(confirmar).toHaveBeenCalled());
    await vi.waitFor(() => expect(api.addPanel).toHaveBeenCalled());
    expect(fechar).not.toHaveBeenCalled();
    expect((api.addPanel.mock.calls[0][0] as { id: string }).id).toBe("Nota.md");
  });

  it("gravação falha: com confirmação, descarta o documento", async () => {
    salvarAteDrenar.mockResolvedValue("erro");
    confirmar.mockResolvedValue(true);

    ws().aoRemoverPainel("Nota.md", "Nota.md");

    await vi.waitFor(() => expect(fechar).toHaveBeenCalledWith("Nota.md"));
  });

  it("conflito pendente: reabre a aba sem perguntar (decisão é do usuário, doc 04 §1)", async () => {
    salvarAteDrenar.mockResolvedValue("bloqueado");
    const api = apiFalsa();
    useWorkspaceStore.setState({ api: api as never });

    ws().aoRemoverPainel("Nota.md", "Nota.md");

    await vi.waitFor(() => expect(api.addPanel).toHaveBeenCalled());
    expect(confirmar).not.toHaveBeenCalled();
    expect(fechar).not.toHaveBeenCalled();
  });

  it("aba sem caminho (vazia/início): não drena nada", async () => {
    ws().aoRemoverPainel("vazio:1", null);
    await Promise.resolve();

    expect(salvarAteDrenar).not.toHaveBeenCalled();
    expect(fechar).not.toHaveBeenCalled();
  });
});

// Regressão do achado 09 da auditoria de 12/09: o rename remonta todos os painéis do
// arquivo e precisa levar os params junto — perder `somenteLeitura` do clone de split
// reabri a edição dupla que a trava do ADR-13 existe para impedir.
describe("workspaceStore.renomearDocumento — preservação de params", () => {
  it("segunda vista do split continua somenteLeitura depois do rename", () => {
    const paineis = [
      { id: "Nota.md", params: { path: "Nota.md" }, title: "Nota" },
      { id: "clone", params: { path: "Nota.md", somenteLeitura: true }, title: "Nota" },
    ];
    const novos: Array<{ id: string; params: Record<string, unknown> }> = [];
    const api = {
      panels: paineis,
      activePanel: paineis[0],
      addPanel: (p: { id: string; params: Record<string, unknown> }) => void novos.push(p),
      removePanel: () => {},
      getPanel: () => null,
    };
    useWorkspaceStore.setState({ api: api as never });

    ws().renomearDocumento("Nota.md", "Nova.md");

    expect(novos).toHaveLength(2);
    expect(novos[0].params).toEqual({ path: "Nova.md" });
    expect(novos[1].params).toEqual({ path: "Nova.md", somenteLeitura: true });
    expect(novos[1].id).not.toBe("clone");
  });
});

// Bug reproduzido pelo dono do produto: editar o título (linha 1) e, sem apertar Enter,
// clicar em outra nota na lateral. O rename é assíncrono (dispara no blur, em
// sincronizarTituloComArquivo.ts) e o addPanel que recria o painel ativava ele de volta
// mesmo quando o usuário já tinha saído para outra aba — porque addPanel sem `inactive`
// sempre ativa o painel novo (dockview-core, options.d.ts). Também cobre a posição: o
// painel recriado deve voltar ao mesmo grupo/índice da aba antiga, não pular para o fim
// da barra nem para o grupo ativo.
describe("workspaceStore.renomearDocumento — foco e posição do painel recriado", () => {
  it("painel não era o ativo: entra inativo e não rouba o foco de quem o usuário abriu", () => {
    const grupo = { id: "g1", panels: [] as unknown[] };
    const painel = { id: "Nota.md", params: { path: "Nota.md" }, group: grupo };
    grupo.panels = [painel];
    const api = {
      panels: [painel],
      activePanel: null,
      addPanel: vi.fn(),
      removePanel: vi.fn(),
      getPanel: vi.fn(() => null),
      getGroup: vi.fn((id: string) => (id === "g1" ? grupo : undefined)),
    };
    useWorkspaceStore.setState({ api: api as never });

    ws().renomearDocumento("Nota.md", "Nova.md");

    const opcoes = api.addPanel.mock.calls[0][0] as {
      inactive?: boolean;
      position?: unknown;
    };
    expect(opcoes.inactive).toBe(true);
    expect(opcoes.position).toEqual({
      referenceGroup: "g1",
      direction: "within",
      index: 0,
    });
  });

  it("painel já era o ativo: entra ativo e reativa depois de recriado", () => {
    const grupo = { id: "g1", panels: [] as unknown[] };
    const painel = { id: "Nota.md", params: { path: "Nota.md" }, group: grupo };
    grupo.panels = [painel];
    const painelNovo = { id: "Nova.md", api: { setActive: vi.fn() } };
    const api = {
      panels: [painel],
      activePanel: painel,
      addPanel: vi.fn(),
      removePanel: vi.fn(),
      getPanel: vi.fn((id: string) => (id === "Nova.md" ? painelNovo : null)),
      getGroup: vi.fn((id: string) => (id === "g1" ? grupo : undefined)),
    };
    useWorkspaceStore.setState({ api: api as never });

    ws().renomearDocumento("Nota.md", "Nova.md");

    const opcoes = api.addPanel.mock.calls[0][0] as { inactive?: boolean };
    expect(opcoes.inactive).toBe(false);
    expect(painelNovo.api.setActive).toHaveBeenCalledTimes(1);
  });

  it("grupo antigo não existe mais (ficou vazio e foi descartado): não força posição", () => {
    const grupo = { id: "g1", panels: [] as unknown[] };
    const painel = { id: "Nota.md", params: { path: "Nota.md" }, group: grupo };
    grupo.panels = [painel];
    const api = {
      panels: [painel],
      activePanel: null,
      addPanel: vi.fn(),
      removePanel: vi.fn(),
      getPanel: vi.fn(() => null),
      // Simula o grupo tendo sido removido junto com o painel (removePanel esvaziou-o).
      getGroup: vi.fn(() => undefined),
    };
    useWorkspaceStore.setState({ api: api as never });

    ws().renomearDocumento("Nota.md", "Nova.md");

    const opcoes = api.addPanel.mock.calls[0][0] as { position?: unknown };
    expect(opcoes.position).toBeUndefined();
  });

  it("segundo painel de um grupo com dois: preserva o índice correto (1)", () => {
    const grupo = { id: "g1", panels: [] as unknown[] };
    const outro = { id: "Outra.md", params: { path: "Outra.md" }, group: grupo };
    const painel = { id: "Nota.md", params: { path: "Nota.md" }, group: grupo };
    grupo.panels = [outro, painel];
    const api = {
      panels: [outro, painel],
      activePanel: null,
      addPanel: vi.fn(),
      removePanel: vi.fn(),
      getPanel: vi.fn(() => null),
      getGroup: vi.fn((id: string) => (id === "g1" ? grupo : undefined)),
    };
    useWorkspaceStore.setState({ api: api as never });

    ws().renomearDocumento("Nota.md", "Nova.md");

    const opcoes = api.addPanel.mock.calls[0][0] as {
      position?: { index?: number };
    };
    expect(opcoes.position).toEqual({
      referenceGroup: "g1",
      direction: "within",
      index: 1,
    });
  });
});

// B2 (doc 13 §2.2): navegação vinda da busca unificada — abrir ao lado (Ctrl+Enter) e
// revelar um trecho depois de abrir.
describe("workspaceStore.abrirDocumento — opções aoLado e revelar", () => {
  it("aoLado sem a aba aberta: abre num grupo novo à direita do painel ativo", () => {
    const ativo = { id: "Ativa.md" };
    const api = {
      panels: [ativo],
      activePanel: ativo,
      addPanel: vi.fn(),
      removePanel: vi.fn(),
      getPanel: vi.fn(() => null),
    };
    useWorkspaceStore.setState({ api: api as never });

    ws().abrirDocumento("Nota.md", { aoLado: true });

    expect(api.addPanel).toHaveBeenCalledTimes(1);
    const opcoes = api.addPanel.mock.calls[0][0] as {
      id: string;
      position?: { referencePanel: string; direction: string };
    };
    expect(opcoes.id).toBe("Nota.md");
    expect(opcoes.position).toEqual({ referencePanel: "Ativa.md", direction: "right" });
  });

  it("aoLado com o arquivo já aberto: só ativa a aba, não duplica", () => {
    const painelExistente = { id: "Nota.md", api: { setActive: vi.fn() } };
    const api = {
      panels: [painelExistente],
      activePanel: painelExistente,
      addPanel: vi.fn(),
      removePanel: vi.fn(),
      getPanel: vi.fn((id: string) => (id === "Nota.md" ? painelExistente : null)),
    };
    useWorkspaceStore.setState({ api: api as never });

    ws().abrirDocumento("Nota.md", { aoLado: true });

    expect(painelExistente.api.setActive).toHaveBeenCalledTimes(1);
    expect(api.addPanel).not.toHaveBeenCalled();
  });

  it("aoLado nunca substitui a aba em branco ativa (é sempre grupo novo)", () => {
    const vazio = { id: "vazio:1" };
    const api = {
      panels: [vazio],
      activePanel: vazio,
      addPanel: vi.fn(),
      removePanel: vi.fn(),
      getPanel: vi.fn(() => null),
    };
    useWorkspaceStore.setState({ api: api as never });

    ws().abrirDocumento("Nota.md", { aoLado: true });

    expect(api.addPanel).toHaveBeenCalledTimes(1);
    expect(api.removePanel).not.toHaveBeenCalled();
  });

  it("revelar: registra o pedido no revelacaoStore para o caminho aberto", () => {
    const api = apiFalsa();
    useWorkspaceStore.setState({ api: api as never });

    ws().abrirDocumento("Nota.md", { revelar: "trecho procurado" });

    expect(useRevelacaoStore.getState().pendente).toEqual(
      expect.objectContaining({ path: "Nota.md", texto: "trecho procurado" }),
    );
  });

  it("revelar junto de aoLado: registra o pedido e abre ao lado", () => {
    const ativo = { id: "Ativa.md" };
    const api = {
      panels: [ativo],
      activePanel: ativo,
      addPanel: vi.fn(),
      removePanel: vi.fn(),
      getPanel: vi.fn(() => null),
    };
    useWorkspaceStore.setState({ api: api as never });

    ws().abrirDocumento("Nota.md", { revelar: "trecho", aoLado: true });

    expect(useRevelacaoStore.getState().pendente?.texto).toBe("trecho");
    expect(api.addPanel).toHaveBeenCalledTimes(1);
  });

  it("chamada sem opções continua funcionando (aba em branco ativa é substituída)", () => {
    const vazio = { id: "vazio:1" };
    const api = {
      panels: [vazio],
      activePanel: vazio,
      addPanel: vi.fn(),
      removePanel: vi.fn(),
      getPanel: vi.fn(() => null),
    };
    useWorkspaceStore.setState({ api: api as never });

    ws().abrirDocumento("Nota.md");

    expect(api.addPanel).toHaveBeenCalledTimes(1);
    expect(api.removePanel).toHaveBeenCalledWith(vazio);
  });
});

describe("workspaceStore — atalhos de aba ignoram a Home (aba escondida)", () => {
  function painel(id: string) {
    return { id, api: { setActive: vi.fn() } };
  }

  it("Ctrl+1 ativa a primeira aba visível, não a Home", () => {
    const inicio = painel("inicio");
    const a = painel("A.md");
    const b = painel("B.md");
    useWorkspaceStore.setState({
      api: { ...apiFalsa(), panels: [inicio, a, b], activePanel: b } as never,
    });
    ws().ativarPorIndice(1);
    expect(a.api.setActive).toHaveBeenCalled();
    expect(inicio.api.setActive).not.toHaveBeenCalled();
  });

  it("Ctrl+Tab pula a Home e, com a Home ativa, vai pra primeira ou última aba", () => {
    const inicio = painel("inicio");
    const a = painel("A.md");
    const b = painel("B.md");
    const api = { ...apiFalsa(), panels: [inicio, a, b], activePanel: b as unknown };
    useWorkspaceStore.setState({ api: api as never });

    ws().cicloAba(1);
    expect(a.api.setActive).toHaveBeenCalledTimes(1);
    expect(inicio.api.setActive).not.toHaveBeenCalled();

    api.activePanel = inicio;
    ws().cicloAba(-1);
    expect(b.api.setActive).toHaveBeenCalledTimes(1);
  });
});

// Onboarding (doc 15 §2.3): abrir a nota de boas-vindas sem esperar um setTimeout — se a API
// do dockview ainda não existe (Workspace não montou), o pedido fica pendente até o próprio
// onReady consumir; se já existe, abre na hora.
describe("workspaceStore.abrirDocumentoQuandoPronto — gancho de documento pendente", () => {
  it("sem API ainda: guarda o caminho em documentoPendente em vez de abrir", () => {
    ws().abrirDocumentoQuandoPronto("Boas-vindas.md");

    expect(ws().documentoPendente).toBe("Boas-vindas.md");
  });

  it("com API já pronta: abre direto e não deixa nada pendente", () => {
    const api = apiFalsa();
    useWorkspaceStore.setState({ api: api as never });

    ws().abrirDocumentoQuandoPronto("Boas-vindas.md");

    expect(api.addPanel).toHaveBeenCalledTimes(1);
    expect(ws().documentoPendente).toBeNull();
  });

  it("definirDocumentoPendente(null) limpa o pendente (o onReady chama isto ao consumir)", () => {
    ws().abrirDocumentoQuandoPronto("Boas-vindas.md");
    expect(ws().documentoPendente).toBe("Boas-vindas.md");

    ws().definirDocumentoPendente(null);

    expect(ws().documentoPendente).toBeNull();
  });
});

describe("workspaceStore — fechar pelo menu da aba (só o quadro da aba)", () => {
  function painel(id: string) {
    return { id, api: { close: vi.fn(), setActive: vi.fn() }, group: { panels: [] as unknown[] } };
  }
  function quadros() {
    const inicio = painel("inicio");
    const a = painel("A.md");
    const b = painel("B.md");
    const c = painel("C.md"); // outro quadro
    inicio.group.panels = a.group.panels = b.group.panels = [inicio, a, b];
    c.group.panels = [c];
    const todos = [inicio, a, b, c];
    useWorkspaceStore.setState({
      api: { ...apiFalsa(), panels: todos, getPanel: (id: string) => todos.find((p) => p.id === id) } as never,
    });
    return { inicio, a, b, c };
  }

  it("fecharTodas fecha as abas do quadro, menos a Home, sem tocar no outro quadro", () => {
    const { inicio, a, b, c } = quadros();
    ws().fecharTodas("A.md");
    expect(a.api.close).toHaveBeenCalled();
    expect(b.api.close).toHaveBeenCalled();
    expect(inicio.api.close).not.toHaveBeenCalled();
    expect(c.api.close).not.toHaveBeenCalled();
  });

  it("fecharOutras poupa a aba clicada, a Home e o outro quadro", () => {
    const { inicio, a, b, c } = quadros();
    ws().fecharOutras("A.md");
    expect(a.api.close).not.toHaveBeenCalled();
    expect(b.api.close).toHaveBeenCalled();
    expect(inicio.api.close).not.toHaveBeenCalled();
    expect(c.api.close).not.toHaveBeenCalled();
  });
});

describe("workspaceStore — delegate explícito de navegação mobile", () => {
  function navegadorMobile() {
    return {
      abrirDocumento: vi.fn<NavegacaoMobile["abrirDocumento"]>(),
      abrirComoTexto: vi.fn<NavegacaoMobile["abrirComoTexto"]>(),
      abrirInicio: vi.fn<NavegacaoMobile["abrirInicio"]>(),
      renomearDocumento: vi.fn<NavegacaoMobile["renomearDocumento"]>(),
      fecharAbasDoCaminho: vi.fn<NavegacaoMobile["fecharAbasDoCaminho"]>(),
    };
  }

  it("abre documento e revela trecho pelo delegate, sem Dockview", () => {
    const navegador = navegadorMobile();
    const api = apiFalsa();
    useWorkspaceStore.setState({ api: api as never });
    instalarNavegacaoMobile(navegador);

    ws().abrirDocumento("Nota.md", { revelar: "trecho" });

    expect(abrir).toHaveBeenCalledWith("Nota.md");
    expect(useRevelacaoStore.getState().pendente).toEqual(
      expect.objectContaining({ path: "Nota.md", texto: "trecho" }),
    );
    expect(navegador.abrirDocumento).toHaveBeenCalledWith("Nota.md", {
      revelar: "trecho",
    });
    expect(api.addPanel).not.toHaveBeenCalled();
  });

  it("encaminha abertura pendente e abertura como texto sem exigir API", () => {
    const navegador = navegadorMobile();
    instalarNavegacaoMobile(navegador);

    ws().abrirDocumentoQuandoPronto("Boas-vindas.md");
    ws().abrirComoTexto("Cena.draw.md");

    expect(navegador.abrirDocumento).toHaveBeenCalledWith("Boas-vindas.md", undefined);
    expect(navegador.abrirComoTexto).toHaveBeenCalledWith("Cena.draw.md");
    expect(abrir).toHaveBeenNthCalledWith(1, "Boas-vindas.md");
    expect(abrir).toHaveBeenNthCalledWith(2, "Cena.draw.md");
    expect(ws().documentoPendente).toBeNull();
  });

  it("encaminha início, rename e exclusão para a casca mobile", () => {
    const navegador = navegadorMobile();
    instalarNavegacaoMobile(navegador);

    ws().abrirInicio();
    ws().renomearDocumento("Antes.md", "Depois.md");
    ws().fecharAbasDoCaminho("Depois.md");

    expect(navegador.abrirInicio).toHaveBeenCalledOnce();
    expect(renomearNoMapa).toHaveBeenCalledWith("Antes.md", "Depois.md");
    expect(navegador.renomearDocumento).toHaveBeenCalledWith("Antes.md", "Depois.md");
    expect(navegador.fecharAbasDoCaminho).toHaveBeenCalledWith("Depois.md");
  });

  it("remover o delegate restaura o comportamento desktop sem API", () => {
    const navegador = navegadorMobile();
    instalarNavegacaoMobile(navegador);
    instalarNavegacaoMobile(null);

    ws().abrirDocumento("Nota.md");

    expect(navegador.abrirDocumento).not.toHaveBeenCalled();
    expect(abrir).not.toHaveBeenCalled();
    expect(ws().documentoPendente).toBeNull();
  });
});
