import { beforeEach, describe, expect, it, vi } from "vitest";
import { VaultAdapterMemoria } from "../vault/VaultAdapterMemoria";
import type { VaultAdapter } from "../vault/VaultAdapter";

const mocks = vi.hoisted(() => ({
  persistirTarefas: vi.fn(async () => {}),
  carregarTarefas: vi.fn(),
  lerConfig: vi.fn(async () => ({})),
  gravarConfig: vi.fn(async () => {}),
  carregarIndice: vi.fn(async () => null),
  salvarIndice: vi.fn(),
  inicializarBusca: vi.fn(async () => {}),
  sincronizarBusca: vi.fn(),
  hashConteudo: vi.fn(async () => "hash"),
  deveIgnorarEvento: vi.fn(() => false),
}));

vi.mock("./tarefasStore", () => ({
  useTarefasStore: {
    getState: () => ({
      _persistirAgora: mocks.persistirTarefas,
      carregar: mocks.carregarTarefas,
    }),
  },
}));
vi.mock("./documentosStore", () => ({
  useDocumentosStore: {
    getState: () => ({ docs: new Map(), aoEventoExterno: vi.fn(async () => {}) }),
  },
}));
vi.mock("../vault/configVault", () => ({
  lerConfigVault: mocks.lerConfig,
  gravarConfigVault: mocks.gravarConfig,
}));
vi.mock("../indice/cache", () => ({
  carregarIndice: mocks.carregarIndice,
  salvarIndice: mocks.salvarIndice,
}));
vi.mock("../busca/minisearchIndex", () => ({
  inicializarBusca: mocks.inicializarBusca,
  sincronizarBusca: mocks.sincronizarBusca,
  atualizarDocumentoBusca: vi.fn(),
  removerDocumentoBusca: vi.fn(),
}));
vi.mock("../vault/escritaAtomica", () => ({
  hashConteudo: mocks.hashConteudo,
  deveIgnorarEvento: mocks.deveIgnorarEvento,
}));

import { useVaultStore } from "./vaultStore";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.lerConfig.mockResolvedValue({});
  mocks.carregarIndice.mockResolvedValue(null);
  mocks.hashConteudo.mockResolvedValue("hash");
  mocks.deveIgnorarEvento.mockReturnValue(false);
  useVaultStore.setState({
    adapter: null,
    raiz: "",
    entradas: [],
    arvore: null,
    indice: new Map(),
    statusIndice: "vazio",
  });
});

describe("vaultStore — contrato VaultAdapter", () => {
  it("define e indexa um adapter sem APIs específicas do Tauri", async () => {
    const adapter: VaultAdapter = new VaultAdapterMemoria("privado:/vault-1");
    await adapter.escreverTexto("Nota.md", "# Nota\nConteúdo local");

    await useVaultStore.getState().definirAdapter(adapter);

    expect(useVaultStore.getState().adapter).toBe(adapter);
    expect(useVaultStore.getState().raiz).toBe("privado:/vault-1");
    expect(useVaultStore.getState().entradas.map((item) => item.path)).toContain("Nota.md");
    expect(useVaultStore.getState().indice.has("Nota.md")).toBe(true);
    expect(mocks.inicializarBusca).toHaveBeenCalledWith("privado:/vault-1");
  });

  it("usa raiz mais caminho relativo para comparar evento do watcher", async () => {
    const adapter = new VaultAdapterMemoria("C:/vault");
    await adapter.escreverTexto("Nota.md", "conteúdo");
    await useVaultStore.getState().definirAdapter(adapter);

    await useVaultStore.getState().reconciliar([
      { tipo: "modificado", path: "Nota.md" },
    ]);

    expect(mocks.deveIgnorarEvento).toHaveBeenCalledWith("C:/vault/Nota.md", "hash");
  });
});
