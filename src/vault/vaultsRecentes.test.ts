import { describe, it, expect, beforeEach, vi } from "vitest";

const { armazenado } = vi.hoisted(() => ({ armazenado: new Map<string, unknown>() }));

vi.mock("@tauri-apps/plugin-store", () => ({
  load: async () => ({
    async get<T>(chave: string) {
      return armazenado.get(chave) as T | undefined;
    },
    async set(chave: string, valor: unknown) {
      armazenado.set(chave, valor);
    },
    async save() {},
  }),
}));

import {
  MAX_RECENTES,
  listarRecentes,
  mesmoVault,
  migrarDeVaultPath,
  nomeDoVault,
  registrarAbertura,
  removerDosRecentes,
  upsertRecente,
  type VaultRecente,
} from "./vaultsRecentes";

beforeEach(() => {
  armazenado.clear();
});

describe("nomeDoVault", () => {
  it("pega o último segmento com barra normal", () => {
    expect(nomeDoVault("C:/Users/lucas/MeuVault")).toBe("MeuVault");
  });

  it("pega o último segmento com barra invertida", () => {
    expect(nomeDoVault("C:\\Users\\lucas\\MeuVault")).toBe("MeuVault");
  });

  it("ignora barra final", () => {
    expect(nomeDoVault("C:/Users/lucas/MeuVault/")).toBe("MeuVault");
    expect(nomeDoVault("C:\\Users\\lucas\\MeuVault\\")).toBe("MeuVault");
  });
});

describe("mesmoVault", () => {
  it("compara ignorando maiúsculas/minúsculas", () => {
    expect(mesmoVault("C:/Vaults/Notas", "c:/vaults/notas")).toBe(true);
  });

  it("compara ignorando o tipo de barra", () => {
    expect(mesmoVault("C:/Vaults/Notas", "C:\\Vaults\\Notas")).toBe(true);
  });

  it("ignora barra final", () => {
    expect(mesmoVault("C:/Vaults/Notas/", "C:/Vaults/Notas")).toBe(true);
  });

  it("diferencia vaults diferentes", () => {
    expect(mesmoVault("C:/Vaults/Notas", "C:/Vaults/Outro")).toBe(false);
  });
});

describe("upsertRecente", () => {
  it("insere no topo quando a lista está vazia", () => {
    const r = upsertRecente([], "C:/Vaults/A", 100);
    expect(r).toEqual([{ caminho: "C:/Vaults/A", abertoEm: 100 }]);
  });

  it("substitui a entrada existente do mesmo vault, sem duplicar", () => {
    const lista: VaultRecente[] = [{ caminho: "C:/Vaults/A", abertoEm: 100 }];
    const r = upsertRecente(lista, "c:/vaults/a", 200);
    expect(r).toEqual([{ caminho: "c:/vaults/a", abertoEm: 200 }]);
  });

  it("ordena por abertoEm desc", () => {
    const lista: VaultRecente[] = [
      { caminho: "C:/Vaults/A", abertoEm: 100 },
      { caminho: "C:/Vaults/B", abertoEm: 300 },
    ];
    const r = upsertRecente(lista, "C:/Vaults/C", 200);
    expect(r.map((v) => v.caminho)).toEqual(["C:/Vaults/B", "C:/Vaults/C", "C:/Vaults/A"]);
  });

  it("corta em MAX_RECENTES", () => {
    const lista: VaultRecente[] = Array.from({ length: MAX_RECENTES }, (_, i) => ({
      caminho: `C:/Vaults/${i}`,
      abertoEm: i,
    }));
    const r = upsertRecente(lista, "C:/Vaults/novo", 1000);
    expect(r.length).toBe(MAX_RECENTES);
    expect(r[0].caminho).toBe("C:/Vaults/novo");
    // o mais antigo (abertoEm: 0) saiu.
    expect(r.some((v) => v.caminho === "C:/Vaults/0")).toBe(false);
  });
});

describe("migrarDeVaultPath", () => {
  it("mantém a lista salva quando ela existe, ignorando o vaultPath antigo", () => {
    const salva: VaultRecente[] = [{ caminho: "C:/Vaults/A", abertoEm: 1 }];
    expect(migrarDeVaultPath(salva, "C:/Vaults/Antigo", 999)).toBe(salva);
  });

  it("semeia com o vaultPath antigo quando não há lista salva", () => {
    expect(migrarDeVaultPath(undefined, "C:/Vaults/Antigo", 999)).toEqual([
      { caminho: "C:/Vaults/Antigo", abertoEm: 999 },
    ]);
  });

  it("devolve lista vazia sem lista salva nem vaultPath antigo", () => {
    expect(migrarDeVaultPath(undefined, undefined, 999)).toEqual([]);
  });
});

describe("listarRecentes / registrarAbertura / removerDosRecentes (com store mockado)", () => {
  it("lista vazia quando não há nada salvo", async () => {
    expect(await listarRecentes()).toEqual([]);
  });

  it("registrarAbertura insere e persiste; listarRecentes relê do store", async () => {
    await registrarAbertura("C:/Vaults/A");
    const lista = await listarRecentes();
    expect(lista).toHaveLength(1);
    expect(lista[0].caminho).toBe("C:/Vaults/A");
    expect(armazenado.get("vaultPath")).toBe("C:/Vaults/A");
  });

  it("registrarAbertura do mesmo vault de novo não duplica, só atualiza abertoEm", async () => {
    await registrarAbertura("C:/Vaults/A");
    const primeiro = (await listarRecentes())[0].abertoEm;
    await new Promise((r) => setTimeout(r, 2));
    await registrarAbertura("C:/Vaults/A");
    const lista = await listarRecentes();
    expect(lista).toHaveLength(1);
    expect(lista[0].abertoEm).toBeGreaterThanOrEqual(primeiro);
  });

  it("migra vaultPath antigo na primeira leitura sem lista salva", async () => {
    armazenado.set("vaultPath", "C:/Vaults/Legado");
    const lista = await listarRecentes();
    expect(lista).toHaveLength(1);
    expect(lista[0].caminho).toBe("C:/Vaults/Legado");
  });

  it("removerDosRecentes tira só o vault indicado", async () => {
    await registrarAbertura("C:/Vaults/A");
    await registrarAbertura("C:/Vaults/B");
    await removerDosRecentes("c:/vaults/a");
    const lista = await listarRecentes();
    expect(lista.map((v) => v.caminho)).toEqual(["C:/Vaults/B"]);
  });
});
