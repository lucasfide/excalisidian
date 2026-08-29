import { describe, it, expect } from "vitest";
import { buscarSugestoesLink } from "../indice/sugestoesLink";
import type { FileMeta } from "../indice/parser";

function criarMeta(path: string, title?: string, aliases: string[] = [], kind: "note" | "drawing" | "attachment" = "note"): FileMeta {
  const nome = path.slice(path.lastIndexOf("/") + 1);
  const isDesenho = path.endsWith(".draw.md");
  return {
    path,
    kind: isDesenho ? "drawing" : kind,
    mtimeMs: 1000,
    size: 50,
    title: title ?? nome.replace(/\.draw\.md$/i, "").replace(/\.md$/i, ""),
    aliases,
    headings: [],
    blockIds: [],
    outLinks: [],
    embeds: [],
  };
}

describe("buscarSugestoesLink", () => {
  const indice = new Map<string, FileMeta>([
    ["Excalisidian.md", criarMeta("Excalisidian.md", "Excalisidian")],
    ["Projetos/Excalisidian.md", criarMeta("Projetos/Excalisidian.md", "Projeto Excalisidian", ["App Principal"])],
    ["Desenhos/Fluxo.draw.md", criarMeta("Desenhos/Fluxo.draw.md", "Fluxo de Telas")],
    ["Notas/Ideias.md", criarMeta("Notas/Ideias.md", "Ideias Gerais", ["Brainstorm"])],
  ]);

  it("retorna sugestões quando a busca está vazia ou com `[[`", () => {
    const res = buscarSugestoesLink("[[", 10, indice);
    expect(res.length).toBeGreaterThanOrEqual(4);
  });

  it("filtra e pontua por correspondência de título e nome de arquivo", () => {
    const res = buscarSugestoesLink("[[Fluxo", 10, indice);
    expect(res.length).toBeGreaterThan(0);
    expect(res[0].alvo).toBe("Fluxo.draw");
    expect(res[0].tipo).toBe("desenho");
  });

  it("encontra itens por alias", () => {
    const res = buscarSugestoesLink("Brainstorm", 10, indice);
    expect(res.length).toBe(1);
    expect(res[0].alvo).toBe("Ideias");
    expect(res[0].rotulo).toBe("Brainstorm");
  });

  it("desambigua homônimos usando caminho relativo", () => {
    const res = buscarSugestoesLink("Excalisidian", 10, indice);
    // Existem dois "Excalisidian.md" no índice (raiz e Projetos/)
    const alvos = res.map((r) => r.alvo);
    expect(alvos).toContain("Excalisidian");
    expect(alvos).toContain("Projetos/Excalisidian");
  });
});
