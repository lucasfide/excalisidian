import { describe, it, expect } from "vitest";

import { analisarMiolo, extrairLinks } from "./wikilink";
import { parsearNota } from "./parser";
import { construirIndiceResolucao, resolverLink } from "./resolucao";
import { construirIndiceLinks } from "./backlinks";

describe("wikilink — análise do miolo", () => {
  it("separa alvo, subcaminho e alias", () => {
    expect(analisarMiolo("Projetos/Nota#Título|texto")).toMatchObject({
      target: "Projetos/Nota",
      subpath: "#Título",
      alias: "texto",
      invalido: false,
    });
  });

  it("aceita link só de subcaminho na própria nota", () => {
    expect(analisarMiolo("#Introdução")).toMatchObject({
      target: "",
      subpath: "#Introdução",
      invalido: false,
    });
  });

  it("recusa alvo com caractere proibido", () => {
    expect(analisarMiolo("a^b").invalido).toBe(true);
    expect(analisarMiolo("").invalido).toBe(true);
  });
});

describe("wikilink — extração", () => {
  it("distingue link de embed e guarda linha e contexto", () => {
    const txt = "linha um\nVer [[Arquitetura]] aqui\n![[diagrama.png|400]]\n";
    const links = extrairLinks(txt);
    expect(links).toHaveLength(2);
    expect(links[0]).toMatchObject({ target: "Arquitetura", embed: false, line: 2 });
    expect(links[0].contexto).toBe("Ver [[Arquitetura]] aqui");
    expect(links[1]).toMatchObject({ target: "diagrama.png", alias: "400", embed: true, line: 3 });
  });
});

describe("parsearNota", () => {
  const disco = { mtimeMs: 1, size: 1 };

  it("extrai título do H1, aliases do frontmatter, headings e blockIds", () => {
    const txt = [
      "---",
      "aliases: [ADR-3, Decisão]",
      "---",
      "",
      "# Por que o canvas é markdown",
      "",
      "Uma frase referenciável. ^decisao-canvas",
      "",
      "## Detalhes",
      "```",
      "# isto não é heading",
      "```",
    ].join("\n");
    const meta = parsearNota("Notas/Canvas.md", txt, disco);
    expect(meta.title).toBe("Por que o canvas é markdown");
    expect(meta.aliases).toEqual(["ADR-3", "Decisão"]);
    expect(meta.headings.map((h) => [h.level, h.text])).toEqual([
      [1, "Por que o canvas é markdown"],
      [2, "Detalhes"],
    ]);
    expect(meta.blockIds).toEqual(["decisao-canvas"]);
  });

  it("sem H1, o título é o basename sem extensão (inclusive .draw.md)", () => {
    expect(parsearNota("x/Arquitetura.draw.md", "sem heading", disco).title).toBe(
      "Arquitetura",
    );
  });
});

describe("resolução de link (doc 02 §4)", () => {
  it("[[Arquitetura]] resolve para a nota quando há Arquitetura.md e Arquitetura.draw.md", () => {
    const idx = construirIndiceResolucao([
      "Projetos/Arquitetura.md",
      "Projetos/Arquitetura.draw.md",
    ]);
    expect(resolverLink(idx, "Arquitetura", "Projetos/Nota.md")).toBe(
      "Projetos/Arquitetura.md",
    );
    // O desenho exige o sufixo .draw
    expect(resolverLink(idx, "Arquitetura.draw", "Projetos/Nota.md")).toBe(
      "Projetos/Arquitetura.draw.md",
    );
  });

  it("nomes duplicados em pastas diferentes: vence a menor distância de pasta", () => {
    const idx = construirIndiceResolucao([
      "A/Nota.md",
      "A/Sub/Nota.md",
      "B/Nota.md",
    ]);
    expect(resolverLink(idx, "Nota", "A/Sub/Coisa.md")).toBe("A/Sub/Nota.md"); // mesma pasta
    expect(resolverLink(idx, "Nota", "A/Coisa.md")).toBe("A/Nota.md"); // mesma pasta da origem
  });

  it("empate remanescente: ordem alfabética do caminho", () => {
    const idx = construirIndiceResolucao(["Z/Nota.md", "A/Nota.md"]);
    expect(resolverLink(idx, "Nota", "Raiz/Coisa.md")).toBe("A/Nota.md");
  });

  it("alvo com barra resolve como caminho a partir da raiz, tentando .md e .draw.md", () => {
    const idx = construirIndiceResolucao([
      "Projetos/Arquitetura.draw.md",
      "Projetos/Backend.md",
    ]);
    expect(resolverLink(idx, "Projetos/Backend", "x.md")).toBe("Projetos/Backend.md");
    expect(resolverLink(idx, "Projetos/Arquitetura.draw", "x.md")).toBe(
      "Projetos/Arquitetura.draw.md",
    );
  });

  it("alvo inexistente devolve null", () => {
    const idx = construirIndiceResolucao(["Nota.md"]);
    expect(resolverLink(idx, "Fantasma", "Nota.md")).toBeNull();
  });
});

describe("backlinks", () => {
  const disco = { mtimeMs: 1, size: 1 };

  it("agrega quem aponta para uma nota e lista os alvos não resolvidos", () => {
    const a = parsearNota("A.md", "Aponta para [[B]] e para [[Fantasma]].", disco);
    const c = parsearNota("sub/C.md", "Também cita [[B|o beta]].", disco);
    const resolucao = construirIndiceResolucao(["A.md", "B.md", "sub/C.md"]);
    const { backlinks, naoResolvidos } = construirIndiceLinks([a, c], resolucao);

    expect(backlinks.get("B.md")?.map((x) => x.origem)).toEqual(["A.md", "sub/C.md"]);
    expect(backlinks.get("B.md")?.[1].alias).toBe("o beta");
    expect(naoResolvidos.get("fantasma")).toEqual(["A.md"]);
  });
});
