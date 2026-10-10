import { describe, it, expect, beforeEach, vi } from "vitest";

const { disco, vaultState } = vi.hoisted(() => {
  const disco = new Map<string, string>();
  const vaultState = {
    adapter: {
      falhaLeitura: false,
      async existe(p: string) {
        return disco.has(p);
      },
      async lerTexto(p: string) {
        if (vaultState.adapter.falhaLeitura) throw new Error("forbidden path");
        if (!disco.has(p)) throw new Error("ENOENT");
        return disco.get(p)!;
      },
      async escreverTexto(p: string, c: string) {
        disco.set(p, c);
      },
      async criarPasta() {},
    },
  };
  return { disco, vaultState };
});

vi.mock("../estado/vaultStore", () => ({
  useVaultStore: { getState: () => vaultState },
}));

import { lerConfigVault, gravarConfigVault } from "./configVault";

beforeEach(() => {
  disco.clear();
  vaultState.adapter.falhaLeitura = false;
});

describe("lerConfigVault", () => {
  it("arquivo inexistente: devolve default { version: 1 } sem gravar nada", async () => {
    const config = await lerConfigVault();
    expect(config).toEqual({ version: 1 });
    expect(disco.has(".excalisidian/vault.json")).toBe(false);
  });

  it("lê o que está gravado", async () => {
    disco.set(
      ".excalisidian/vault.json",
      JSON.stringify({ version: 1, sortMode: "alphabetical" }),
    );
    expect(await lerConfigVault()).toEqual({ version: 1, sortMode: "alphabetical" });
  });

  it("versão ausente no JSON vira 1", async () => {
    disco.set(".excalisidian/vault.json", JSON.stringify({ sortMode: "custom" }));
    const config = await lerConfigVault();
    expect(config.version).toBe(1);
    expect(config.sortMode).toBe("custom");
  });

  it("JSON inválido não derruba a leitura: volta pro default", async () => {
    disco.set(".excalisidian/vault.json", "{ isso não é json");
    expect(await lerConfigVault()).toEqual({ version: 1 });
  });
});

describe("gravarConfigVault", () => {
  it("grava campos novos preservando os que já existiam e não foram tocados", async () => {
    disco.set(
      ".excalisidian/vault.json",
      JSON.stringify({ version: 1, attachmentMode: "fixed" }),
    );
    await gravarConfigVault({ sortMode: "custom" });
    const gravado = JSON.parse(disco.get(".excalisidian/vault.json")!);
    expect(gravado).toEqual({ version: 1, attachmentMode: "fixed", sortMode: "custom" });
  });

  it("primeira gravação, sem arquivo prévio: cria com version 1 + o patch", async () => {
    await gravarConfigVault({ customOrder: { "": ["A.md"] } });
    const gravado = JSON.parse(disco.get(".excalisidian/vault.json")!);
    expect(gravado).toEqual({ version: 1, customOrder: { "": ["A.md"] } });
  });
});

describe("gravarConfigVault com leitura falhando", () => {
  it("arquivo existe mas a leitura falha: não regrava por cima", async () => {
    const original = JSON.stringify({ version: 1, customOrder: { "": ["B.md", "A.md"] } });
    disco.set(".excalisidian/vault.json", original);
    vaultState.adapter.falhaLeitura = true;
    await gravarConfigVault({ sortMode: "custom" });
    expect(disco.get(".excalisidian/vault.json")).toBe(original);
  });
});
