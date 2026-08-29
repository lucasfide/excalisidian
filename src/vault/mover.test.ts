import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

const { disco, vaultState } = vi.hoisted(() => {
  const disco = new Map<string, string>();
  const backlinksFake = new Map<string, unknown[]>();
  const vaultState = {
    adapter: {
      async lerTexto(p: string) {
        if (!disco.has(p)) throw new Error("ENOENT");
        return disco.get(p)!;
      },
      async escreverTexto(p: string, c: string) {
        disco.set(p, c);
      },
      async existe(p: string) {
        return disco.has(p);
      },
      async mover(de: string, para: string) {
        disco.set(para, disco.get(de)!);
        disco.delete(de);
      },
      absoluto: (p: string) => p,
    },
    links: { backlinks: backlinksFake },
    resolver: (_alvo: string, _origem: string): string | null => null,
    recarregarArvore: async () => {},
    reindexar: async () => {},
  };
  return { disco, vaultState };
});

vi.mock("../estado/vaultStore", () => ({
  useVaultStore: { getState: () => vaultState },
}));
vi.mock("../estado/documentosStore", () => ({
  useDocumentosStore: {
    getState: () => ({
      flushTudo: async () => {},
      recarregarDoDisco: async () => {},
      docs: new Map(),
    }),
  },
}));
vi.mock("../estado/workspaceStore", () => ({
  useWorkspaceStore: { getState: () => ({ renomearDocumento: () => {} }) },
}));

import { moverArquivo } from "./mover";
import { construirIndiceResolucao, resolverLink } from "../indice/resolucao";

beforeEach(() => {
  disco.clear();
  vaultState.links.backlinks.clear();
  vaultState.resolver = () => null;
});

describe("moverArquivo — arrastar na árvore (RF4.x)", () => {
  it("move o arquivo mantendo o nome", async () => {
    disco.set("Nota.md", "# Nota\n");
    const r = await moverArquivo("Nota.md", "Projetos");
    expect(r.ok).toBe(true);
    expect(r.pathNovo).toBe("Projetos/Nota.md");
    expect(disco.has("Nota.md")).toBe(false);
    expect(disco.get("Projetos/Nota.md")).toBe("# Nota\n");
  });

  it("link de caminho completo acompanha o move; link só por nome nem precisa mudar", async () => {
    // O arquivo já vive numa subpasta ("A"); movê-lo para "B" muda o caminho completo, mas
    // não o nome — um wikilink escrito com caminho ("[[A/Nota]]") precisa acompanhar, um
    // escrito só pelo nome ("[[Nota]]") continua resolvendo por basename sem precisar mudar.
    const idx = construirIndiceResolucao(["A/Nota.md", "Diario.md"]);
    vaultState.resolver = (alvo, origem) => resolverLink(idx, alvo, origem);
    vaultState.links.backlinks.set("A/Nota.md", [
      { origem: "Diario.md", line: 1, contexto: "", embed: false },
    ]);
    disco.set("A/Nota.md", "# Nota\n");
    disco.set("Diario.md", "Completo: [[A/Nota]]. Por nome: [[Nota]].");

    const r = await moverArquivo("A/Nota.md", "B");

    expect(r.ok).toBe(true);
    expect(r.pathNovo).toBe("B/Nota.md");
    expect(disco.get("Diario.md")).toBe("Completo: [[B/Nota]]. Por nome: [[Nota]].");
  });

  it("mover para a mesma pasta que já está é um no-op", async () => {
    disco.set("Projetos/Nota.md", "# Nota\n");
    const r = await moverArquivo("Projetos/Nota.md", "Projetos");
    expect(r).toEqual({
      ok: true,
      pathNovo: "Projetos/Nota.md",
      notasAtualizadas: 0,
      linksAtualizados: 0,
    });
    expect(disco.get("Projetos/Nota.md")).toBe("# Nota\n");
  });

  it("resolve com numeração em vez de recusar quando já existe um arquivo com o mesmo nome", async () => {
    disco.set("Nota.md", "# Nota\n");
    disco.set("Projetos/Nota.md", "# Nota\n");
    const r = await moverArquivo("Nota.md", "Projetos");
    expect(r.ok).toBe(true);
    expect(r.pathNovo).toBe("Projetos/Nota (2).md");
    expect(disco.has("Nota.md")).toBe(false);
    expect(disco.get("Projetos/Nota.md")).toBe("# Nota\n"); // arquivo que já estava lá, intocado
    expect(disco.get("Projetos/Nota (2).md")).toBe("# Nota (2)\n"); // H1 sincronizado com o nome novo
  });

  it("mover para a raiz (dirDestino vazio) tira o prefixo de pasta", async () => {
    disco.set("Projetos/Nota.md", "# Nota\n");
    const r = await moverArquivo("Projetos/Nota.md", "");
    expect(r.ok).toBe(true);
    expect(r.pathNovo).toBe("Nota.md");
    expect(disco.has("Projetos/Nota.md")).toBe(false);
    expect(disco.get("Nota.md")).toBe("# Nota\n");
  });
});
