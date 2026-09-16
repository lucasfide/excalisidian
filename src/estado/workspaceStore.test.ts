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

import { useWorkspaceStore } from "./workspaceStore";
import { useRevelacaoStore } from "./revelacaoStore";

const ws = () => useWorkspaceStore.getState();

function apiFalsa() {
  return {
    panels: [] as unknown[],
    activePanel: null,
    addPanel: vi.fn(),
    removePanel: vi.fn(),
    getPanel: vi.fn(() => null),
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
