// Testes de `src/sync/coordenacao.ts` (plano 12 Task 3): `invoke` mockado, mesmo padrão de
// `src/conta/cofreChaveDeEnvelope.test.ts`. `chaveDeVault` usa os mesmos exemplos do teste Rust
// de `normalizar_chave` (`src-tauri/src/janelas.rs`) — os dois lados têm que concordar.

import { describe, it, expect, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { chaveDeVault, vaultsAbertos, tentarTravarSync, liberarTravaSync } from "./coordenacao";

describe("chaveDeVault", () => {
  it("normaliza igual ao Rust: minúsculas, barra invertida vira barra, sem barra final", () => {
    expect(chaveDeVault("C:\\Vaults\\Casa")).toBe("c:/vaults/casa");
    expect(chaveDeVault("c:/vaults/casa/")).toBe("c:/vaults/casa");
    expect(chaveDeVault("C:/Vaults/Casa")).toBe("c:/vaults/casa");
  });
});

describe("vaultsAbertos", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("chama vaults_abertos sem argumentos e devolve as chaves", async () => {
    invokeMock.mockResolvedValueOnce(["c:/vaults/casa"]);
    expect(await vaultsAbertos()).toEqual(["c:/vaults/casa"]);
    expect(invokeMock).toHaveBeenCalledWith("vaults_abertos");
  });
});

describe("tentarTravarSync", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("chama tentar_travar_sync com path e devolve o booleano", async () => {
    invokeMock.mockResolvedValueOnce(true);
    expect(await tentarTravarSync("C:\\Vaults\\Casa")).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("tentar_travar_sync", { path: "C:\\Vaults\\Casa" });
  });

  it("devolve false quando o Rust recusa a trava", async () => {
    invokeMock.mockResolvedValueOnce(false);
    expect(await tentarTravarSync("C:\\Vaults\\Casa")).toBe(false);
  });
});

describe("liberarTravaSync", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("chama liberar_trava_sync com path", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await liberarTravaSync("C:\\Vaults\\Casa");
    expect(invokeMock).toHaveBeenCalledWith("liberar_trava_sync", { path: "C:\\Vaults\\Casa" });
  });
});
