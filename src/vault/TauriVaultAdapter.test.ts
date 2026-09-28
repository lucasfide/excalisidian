// Testes de `TauriVaultAdapter.doBoot()` — caminho real de boot com o último vault salvo.
//
// Bug do relato (dono do produto renomeou a pasta do último vault e viu a mensagem GENÉRICA em
// vez de "pasta não encontrada"): `permitir_vault` (`fs_scope().allow_directory`) NÃO falha pra
// pasta inexistente — só registra o padrão de escopo. O erro real só aparecia depois, dentro de
// `walk_vault` (chamado por `vaultStore.definirAdapter` -> `recarregarArvore` -> `listar`), FORA
// de `doBoot()` — então nunca virava `ErroAberturaVault` e `App.tsx` chamava `erroDeBoot(e)` sem
// o caminho conhecido, o que fazia `mensagemFalhaAbrir` cair sempre no genérico (precisa do
// caminho pra montar a mensagem específica).
//
// A correção: `doBoot()` agora confere `vault_existe` (comando Rust, `std::path::Path::is_dir`,
// não depende de escopo de FS nem de texto de erro do SO) ANTES de `permitir_vault`, e joga
// `ErroAberturaVault(ERRO_PASTA_NAO_ENCONTRADA, caminho)` — com o caminho sempre conhecido, já
// que veio do próprio `doBoot`.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  storeGet: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mocks.invoke(...args),
}));

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => ({
    listen: vi.fn(async () => () => {}),
  }),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: vi.fn(),
  readFile: vi.fn(),
  mkdir: vi.fn(),
  exists: vi.fn(),
  rename: vi.fn(),
  remove: vi.fn(),
  readDir: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-store", () => ({
  load: vi.fn(async () => ({ get: (...args: unknown[]) => mocks.storeGet(...args) })),
}));

import { TauriVaultAdapter, ErroAberturaVault } from "./TauriVaultAdapter";
import { ERRO_PASTA_NAO_ENCONTRADA, mensagemFalhaAbrir } from "./mensagemFalhaAbrir";

const CAMINHO = "C:\\Users\\alguem\\Vaults\\Excalisidian-vault-teste 2";

describe("TauriVaultAdapter.doBoot", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.storeGet.mockReset();
    vi.stubGlobal("window", { location: { search: "" } });
  });

  it("pasta do último vault sumiu: joga ErroAberturaVault com o caminho conhecido, sem nem chamar permitir_vault", async () => {
    mocks.storeGet.mockResolvedValueOnce(CAMINHO);
    mocks.invoke.mockImplementation((cmd: string) => {
      if (cmd === "vault_existe") return Promise.resolve(false);
      throw new Error(`não deveria chamar ${cmd}`);
    });

    await expect(TauriVaultAdapter.doBoot()).rejects.toMatchObject({
      name: "ErroAberturaVault",
      message: ERRO_PASTA_NAO_ENCONTRADA,
      caminho: CAMINHO,
    });
    expect(mocks.invoke).toHaveBeenCalledWith("vault_existe", { path: CAMINHO });
    expect(mocks.invoke).not.toHaveBeenCalledWith("permitir_vault", expect.anything());
  });

  it("o erro de pasta sumida no boot vira a mensagem específica (nunca a genérica)", async () => {
    mocks.storeGet.mockResolvedValueOnce(CAMINHO);
    mocks.invoke.mockImplementation((cmd: string) =>
      cmd === "vault_existe" ? Promise.resolve(false) : Promise.reject(new Error("inesperado")),
    );

    let erro: unknown;
    try {
      await TauriVaultAdapter.doBoot();
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(ErroAberturaVault);
    const e = erro as ErroAberturaVault;
    expect(mensagemFalhaAbrir(e.message, e.caminho)).toEqual({
      chave: "vault.erroAbrir.pastaNaoEncontrada",
      valores: { nome: "Excalisidian-vault-teste 2" },
    });
  });

  it("pasta existe: chama permitir_vault e devolve o adapter normalmente", async () => {
    mocks.storeGet.mockResolvedValueOnce(CAMINHO);
    mocks.invoke.mockImplementation((cmd: string) => {
      if (cmd === "vault_existe") return Promise.resolve(true);
      if (cmd === "permitir_vault") return Promise.resolve(undefined);
      throw new Error(`chamada inesperada: ${cmd}`);
    });

    const adapter = await TauriVaultAdapter.doBoot();
    expect(adapter?.raiz()).toBe(CAMINHO);
    expect(mocks.invoke).toHaveBeenCalledWith("permitir_vault", { path: CAMINHO });
  });

  it("sem vault salvo nem `?vault=` na URL: devolve null sem chamar nada", async () => {
    mocks.storeGet.mockResolvedValueOnce(undefined);
    const adapter = await TauriVaultAdapter.doBoot();
    expect(adapter).toBeNull();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
