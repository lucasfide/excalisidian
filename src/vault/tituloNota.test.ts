import { describe, it, expect } from "vitest";
import { sincronizarH1ComTitulo, h1DaPrimeiraLinha } from "./tituloNota";

describe("sincronizarH1ComTitulo", () => {
  it("troca o texto do H1 existente, preservando o resto", () => {
    const texto = "# Nome Antigo\n\nCorpo da nota.\n";
    const saida = sincronizarH1ComTitulo(texto, "Nome Novo");
    expect(saida).toBe("# Nome Novo\n\nCorpo da nota.\n");
  });

  it("não mexe em nada quando o H1 já é o título pedido", () => {
    const texto = "# Nome Novo\n\nCorpo.\n";
    expect(sincronizarH1ComTitulo(texto, "Nome Novo")).toBe(texto);
  });

  it("insere um H1 no topo quando não existe nenhum", () => {
    const texto = "Só um parágrafo, sem heading nenhum.\n";
    const saida = sincronizarH1ComTitulo(texto, "Nome Novo");
    expect(saida).toBe("# Nome Novo\n\nSó um parágrafo, sem heading nenhum.\n");
  });

  it("insere depois do frontmatter, não antes", () => {
    const texto = "---\naliases: [Apelido]\n---\nCorpo sem H1.\n";
    const saida = sincronizarH1ComTitulo(texto, "Nome Novo");
    expect(saida).toBe(
      "---\naliases: [Apelido]\n---\n# Nome Novo\n\nCorpo sem H1.\n",
    );
  });

  it("troca só o H1 fora de bloco de código, ignorando '#' dentro de ```", () => {
    const texto = "# Título\n\n```\n# isto não é heading\n```\n";
    const saida = sincronizarH1ComTitulo(texto, "Outro");
    expect(saida).toBe("# Outro\n\n```\n# isto não é heading\n```\n");
  });

  it("pega o primeiro H1 quando há H2/H3 antes dele no documento", () => {
    const texto = "## Sub\n\n# Título Real\n\nCorpo.\n";
    const saida = sincronizarH1ComTitulo(texto, "Novo");
    expect(saida).toBe("## Sub\n\n# Novo\n\nCorpo.\n");
  });
});

describe("h1DaPrimeiraLinha", () => {
  it("extrai o texto de um H1 na primeira linha", () => {
    expect(h1DaPrimeiraLinha("# Meu Título")).toBe("Meu Título");
  });

  it("devolve null para H2 ou texto comum", () => {
    expect(h1DaPrimeiraLinha("## Não é H1")).toBe(null);
    expect(h1DaPrimeiraLinha("Texto comum")).toBe(null);
  });
});
