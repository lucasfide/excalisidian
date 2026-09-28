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

  it("gera um dono novo, manda path e dono, e devolve o dono quando trava", async () => {
    invokeMock.mockResolvedValueOnce(true);
    const dono = await tentarTravarSync("C:\\Vaults\\Casa");
    expect(typeof dono).toBe("string");
    expect(dono).not.toBeNull();
    expect(invokeMock).toHaveBeenCalledWith("tentar_travar_sync", {
      path: "C:\\Vaults\\Casa",
      dono,
    });
  });

  it("devolve null quando o Rust recusa a trava", async () => {
    invokeMock.mockResolvedValueOnce(false);
    expect(await tentarTravarSync("C:\\Vaults\\Casa")).toBeNull();
  });

  it("duas chamadas seguidas (mesma janela) geram donos diferentes — não reentrante do lado TS", async () => {
    invokeMock.mockResolvedValueOnce(true).mockResolvedValueOnce(true);
    const primeiro = await tentarTravarSync("C:\\Vaults\\Casa");
    const segundo = await tentarTravarSync("C:\\Vaults\\Casa");
    expect(primeiro).not.toBe(segundo);
  });
});

describe("liberarTravaSync", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("chama liberar_trava_sync com path e o dono certo", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await liberarTravaSync("C:\\Vaults\\Casa", "token-do-ciclo");
    expect(invokeMock).toHaveBeenCalledWith("liberar_trava_sync", {
      path: "C:\\Vaults\\Casa",
      dono: "token-do-ciclo",
    });
  });
});
