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
  useWorkspaceStore.setState({ api: null, caminhoAtivo: null, fechadosRecentes: [] });
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
