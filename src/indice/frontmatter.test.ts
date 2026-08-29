import { describe, it, expect } from "vitest";

import { lerFrontmatter } from "./frontmatter";

describe("lerFrontmatter — sem gray-matter, sem Buffer", () => {
  it("sem frontmatter: data vazio, conteúdo é o arquivo inteiro", () => {
    const r = lerFrontmatter("# Título\n\ncorpo");
    expect(r.data).toEqual({});
    expect(r.conteudo).toBe("# Título\n\ncorpo");
    expect(r.linhas).toBe(0);
  });

  it("frontmatter válido: extrai os campos e devolve o resto", () => {
    const md = "---\naliases: [ADR-3, Decisão]\ncreated: 2026-08-28\n---\n# Título\ncorpo";
    const r = lerFrontmatter(md);
    expect(r.data.aliases).toEqual(["ADR-3", "Decisão"]);
    expect(r.conteudo).toBe("# Título\ncorpo");
    expect(r.linhas).toBe(4);
  });

  it("YAML inválido: nunca lança, trata como sem frontmatter", () => {
    const md = "---\naliases: [não fechou\n---\ncorpo";
    expect(() => lerFrontmatter(md)).not.toThrow();
    const r = lerFrontmatter(md);
    expect(r.data).toEqual({});
  });

  it("--- sem fechamento não é frontmatter", () => {
    const md = "---\nnunca fecha\nmais texto";
    const r = lerFrontmatter(md);
    expect(r.data).toEqual({});
    expect(r.conteudo).toBe(md);
  });

  it("--- no meio do corpo não conta como frontmatter", () => {
    const md = "texto antes\n---\nnão é frontmatter";
    const r = lerFrontmatter(md);
    expect(r.data).toEqual({});
    expect(r.conteudo).toBe(md);
  });

  it("chave excalisidian: drawing é lida (usada por formatoDesenho.ehDesenho)", () => {
    const md = "---\nexcalisidian: drawing\n---\n%%\nconteúdo\n%%\n";
    expect(lerFrontmatter(md).data.excalisidian).toBe("drawing");
  });
});
