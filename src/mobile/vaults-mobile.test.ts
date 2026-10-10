import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke, exists, mkdir, remove, get, set, save, deleteKey, abrir, state } = vi.hoisted(() => ({
  invoke: vi.fn(),
  exists: vi.fn(),
  mkdir: vi.fn(),
  remove: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  save: vi.fn(),
  deleteKey: vi.fn(),
  abrir: vi.fn(),
  state: { value: undefined as unknown },
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/plugin-fs", () => ({ exists, mkdir, remove }));
vi.mock("@tauri-apps/plugin-store", () => ({ load: vi.fn(async () => ({ get, set, save, delete: deleteKey })) }));
vi.mock("../vault/TauriVaultAdapter", () => ({ TauriVaultAdapter: { abrir } }));

import { criarVaultMobile, carregarVaultsMobile, validarRegistroVaultsMobile } from "./vaults-mobile";

describe("registro mobile de vaults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.value = undefined;
    get.mockImplementation(async () => state.value);
    set.mockImplementation(async (_key: string, value: unknown) => { state.value = value; });
    deleteKey.mockImplementation(async () => { state.value = undefined; return true; });
    save.mockResolvedValue(undefined);
    mkdir.mockResolvedValue(undefined);
    exists.mockResolvedValue(false);
    remove.mockResolvedValue(undefined);
    invoke.mockResolvedValue("/private/vaults");
    abrir.mockResolvedValue({});
  });

  it("aceita somente identidade opaca e ids únicos", () => {
    expect(validarRegistroVaultsMobile({
      versao: 1,
      vaults: [{ id: "550e8400-e29b-41d4-a716-446655440000", nome: "Pessoal" }],
      ultimoId: "550e8400-e29b-41d4-a716-446655440000",
    })).toBe(true);
    expect(validarRegistroVaultsMobile({ versao: 1, vaults: [{ id: "C:/Users/name", nome: "Pessoal" }], ultimoId: null })).toBe(false);
    expect(validarRegistroVaultsMobile({ versao: 1, vaults: [], ultimoId: "/private/vaults" })).toBe(false);
  });

  it("não substitui silenciosamente um registro corrompido", async () => {
    get.mockResolvedValue({ versao: 1, vaults: [{ id: "C:/private", nome: "Pessoal" }], ultimoId: null });
    await expect(carregarVaultsMobile()).rejects.toThrow("preservado sem alterações");
    expect(set).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("remove a pasta privada se abrir ou publicar o registro falhar", async () => {
    abrir.mockRejectedValueOnce(new Error("scope denied"));
    await expect(criarVaultMobile("Pessoal")).rejects.toThrow("scope denied");
    expect(mkdir).toHaveBeenCalledWith(expect.stringMatching(/^\/private\/vaults\/[0-9a-f-]{36}$/));
    expect(remove).toHaveBeenCalledWith(expect.stringMatching(/^\/private\/vaults\/[0-9a-f-]{36}$/), { recursive: true });
    expect(set).not.toHaveBeenCalled();
  });

  it("remove a pasta quando persistir a publicação falha", async () => {
    save.mockRejectedValueOnce(new Error("store unavailable"));
    await expect(criarVaultMobile("Pessoal")).rejects.toThrow("store unavailable");
    expect(remove).toHaveBeenCalledTimes(1);
    expect(state.value).toBeUndefined();
  });

  it("serializa criações concorrentes e não publica nomes duplicados", async () => {
    const resultados = await Promise.allSettled([
      criarVaultMobile("Pessoal"),
      criarVaultMobile("Pessoal"),
    ]);
    expect(resultados.filter((resultado) => resultado.status === "fulfilled")).toHaveLength(1);
    expect(resultados.filter((resultado) => resultado.status === "rejected")).toHaveLength(1);
    expect(mkdir).toHaveBeenCalledTimes(1);
    expect((state.value as { vaults: unknown[] }).vaults).toHaveLength(1);
  });

  it("não liga o watcher desktop no adapter mobile", async () => {
    const aberto = await criarVaultMobile("Pessoal");
    const cancelarEventos = aberto.adapter.observar(() => undefined);
    const cancelarRessincronia = aberto.adapter.aoPerderSincronia(() => undefined);
    cancelarEventos();
    cancelarRessincronia();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("preparar_vaults_mobile");
  });
});
