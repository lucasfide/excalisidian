import { describe, it, expect, beforeEach, vi } from "vitest";

const { disco, pastas, entradasFake, vaultState, painelFechado, painelChamadas } = vi.hoisted(
  () => {
    const disco = new Map<string, string>();
    const pastas = new Set<string>();
    const entradasFake: { path: string; isDir: boolean }[] = [];
    const painelFechado: string[] = [];
    const painelChamadas: string[] = [];

    function moverSubarvore(de: string, para: string) {
      if (disco.has(de)) {
        disco.set(para, disco.get(de)!);
        disco.delete(de);
        return;
      }
      const prefixoAntigo = `${de}/`;
      const prefixoNovo = `${para}/`;
      if (pastas.has(de)) {
        pastas.delete(de);
        pastas.add(para);
      }
      for (const p of [...pastas]) {
        if (p.startsWith(prefixoAntigo)) {
          pastas.delete(p);
          pastas.add(prefixoNovo + p.slice(prefixoAntigo.length));
        }
      }
      for (const [k, v] of [...disco.entries()]) {
        if (k.startsWith(prefixoAntigo)) {
          disco.delete(k);
          disco.set(prefixoNovo + k.slice(prefixoAntigo.length), v);
        }
      }
    }

    const vaultState = {
      entradas: entradasFake,
      adapter: {
        async lerTexto(p: string) {
          if (!disco.has(p)) throw new Error("ENOENT");
          return disco.get(p)!;
        },
        async escreverTexto(p: string, c: string) {
          disco.set(p, c);
        },
        async existe(p: string) {
          return disco.has(p) || pastas.has(p);
        },
        async mover(de: string, para: string) {
          moverSubarvore(de, para);
        },
        async remover(p: string) {
          disco.delete(p);
          pastas.delete(p);
          const prefixo = `${p}/`;
          for (const k of [...disco.keys()]) if (k.startsWith(prefixo)) disco.delete(k);
          for (const k of [...pastas]) if (k.startsWith(prefixo)) pastas.delete(k);
        },
        async criarPasta(p: string) {
          pastas.add(p);
        },
        async listarPasta(p: string) {
          const prefixo = `${p}/`;
          const resultado: { nome: string; isDir: boolean }[] = [];
          for (const caminho of disco.keys()) {
            if (!caminho.startsWith(prefixo)) continue;
            const resto = caminho.slice(prefixo.length);
            if (!resto.includes("/")) resultado.push({ nome: resto, isDir: false });
          }
          for (const pasta of pastas) {
            if (!pasta.startsWith(prefixo)) continue;
            const resto = pasta.slice(prefixo.length);
            if (!resto.includes("/")) resultado.push({ nome: resto, isDir: true });
          }
          return resultado;
        },
        absoluto: (p: string) => p,
      },
      recarregarArvore: async () => {},
      reindexar: async () => {},
    };
    return { disco, pastas, entradasFake, vaultState, painelFechado, painelChamadas };
  },
);

vi.mock("../estado/vaultStore", () => ({
  useVaultStore: { getState: () => vaultState },
}));
vi.mock("../estado/documentosStore", () => ({
  useDocumentosStore: { getState: () => ({ flushTudo: async () => {} }) },
}));
vi.mock("../estado/workspaceStore", () => ({
  useWorkspaceStore: {
    getState: () => ({
      fecharAbasDoCaminho: (path: string) => {
        painelChamadas.push(path);
        painelFechado.push(path);
      },
    }),
  },
}));

import { excluir, restaurar, esvaziarLixeira, listarLixeira } from "./lixeira";

function arquivo(path: string, conteudo = "conteúdo") {
  disco.set(path, conteudo);
  entradasFake.push({ path, isDir: false });
}
function pasta(path: string) {
  pastas.add(path);
  entradasFake.push({ path, isDir: true });
}

beforeEach(() => {
  disco.clear();
  pastas.clear();
  entradasFake.length = 0;
  painelFechado.length = 0;
  painelChamadas.length = 0;
});

describe("excluir", () => {
  it("move a nota pra .trash/, registra no índice, fecha a aba", async () => {
    arquivo("Nota.md", "# Nota\n");
    const r = await excluir("Nota.md");
    expect(r.ok).toBe(true);
    expect(disco.has("Nota.md")).toBe(false);
    expect(disco.get(".trash/Nota.md")).toBe("# Nota\n");
    expect(painelFechado).toEqual(["Nota.md"]);

    const itens = await listarLixeira();
    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({
      trashName: "Nota.md",
      originalPath: "Nota.md",
      kind: "note",
    });
    expect(itens[0].deletedAt).not.toBeNull();
  });

  it("move a pasta inteira, preservando a estrutura interna", async () => {
    pasta("Projetos");
    arquivo("Projetos/A.md", "A");
    arquivo("Projetos/B.md", "B");
    const r = await excluir("Projetos");
    expect(r.ok).toBe(true);
    expect(pastas.has("Projetos")).toBe(false);
    expect(pastas.has(".trash/Projetos")).toBe(true);
    expect(disco.get(".trash/Projetos/A.md")).toBe("A");
    expect(disco.get(".trash/Projetos/B.md")).toBe("B");

    const itens = await listarLixeira();
    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({ trashName: "Projetos", kind: "folder" });
  });

  it("nome livre em .trash/ quando já existe um item com o mesmo nome lá", async () => {
    disco.set(".trash/Nota.md", "outra coisa");
    arquivo("Nota.md", "# Nota\n");
    const r = await excluir("Nota.md");
    expect(r.ok).toBe(true);
    expect(disco.get(".trash/Nota (2).md")).toBe("# Nota\n");
    expect(disco.get(".trash/Nota.md")).toBe("outra coisa"); // intocado
  });
});

describe("restaurar", () => {
  it("volta pro caminho original, recriando a pasta se ela sumiu", async () => {
    disco.set(".trash/Nota.md", "# Nota\n");
    const item = {
      trashName: "Nota.md",
      originalPath: "Projetos/Nota.md",
      deletedAt: new Date().toISOString(),
      kind: "note" as const,
    };
    const r = await restaurar(item);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pathFinal).toBe("Projetos/Nota.md");
    expect(disco.get("Projetos/Nota.md")).toBe("# Nota\n");
    expect(pastas.has("Projetos")).toBe(true);
  });

  it("colisão no destino vira «Nome (restaurado)»", async () => {
    disco.set(".trash/Nota.md", "# Nota (lixeira)\n");
    disco.set("Nota.md", "# Nota (já existe)\n");
    const item = {
      trashName: "Nota.md",
      originalPath: "Nota.md",
      deletedAt: new Date().toISOString(),
      kind: "note" as const,
    };
    const r = await restaurar(item);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pathFinal).toBe("Nota (restaurado).md");
    expect(disco.get("Nota.md")).toBe("# Nota (já existe)\n"); // intocado
    expect(disco.get("Nota (restaurado).md")).toBe("# Nota (lixeira)\n");
  });

  it("origem desconhecida (sem registro no índice) restaura pra raiz", async () => {
    disco.set(".trash/Orfao.md", "sem dono");
    const item = {
      trashName: "Orfao.md",
      originalPath: null,
      deletedAt: null,
      kind: "note" as const,
    };
    const r = await restaurar(item);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pathFinal).toBe("Orfao.md");
  });

  it("remove a entrada do índice depois de restaurar", async () => {
    arquivo("Nota.md", "# Nota\n");
    await excluir("Nota.md");
    expect(await listarLixeira()).toHaveLength(1);

    const [item] = await listarLixeira();
    await restaurar(item);
    expect(await listarLixeira()).toHaveLength(0);
  });
});

describe("esvaziarLixeira", () => {
  it("apaga tudo e devolve a contagem real", async () => {
    arquivo("A.md", "a");
    arquivo("B.md", "b");
    await excluir("A.md");
    await excluir("B.md");
    expect(await listarLixeira()).toHaveLength(2);

    const r = await esvaziarLixeira();
    expect(r.removidos).toBe(2);
    expect(disco.has(".trash/A.md")).toBe(false);
    expect(disco.has(".trash/B.md")).toBe(false);
    expect(await listarLixeira()).toHaveLength(0);
  });

  it("apaga também item sem registro no índice", async () => {
    disco.set(".trash/Orfao.md", "sem dono");
    const r = await esvaziarLixeira();
    expect(r.removidos).toBe(1);
    expect(disco.has(".trash/Orfao.md")).toBe(false);
  });
});

describe("listarLixeira", () => {
  it("item sem entrada no índice aparece com origem desconhecida", async () => {
    disco.set(".trash/Orfao.md", "sem dono");
    const itens = await listarLixeira();
    expect(itens).toEqual([
      { trashName: "Orfao.md", originalPath: null, deletedAt: null, kind: "note" },
    ]);
  });

  it("não confunde o próprio .index.json com um item excluído", async () => {
    arquivo("Nota.md", "# Nota\n");
    await excluir("Nota.md");
    const itens = await listarLixeira();
    expect(itens.map((i) => i.trashName)).not.toContain(".index.json");
  });
});
