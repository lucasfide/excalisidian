import { describe, it, expect } from "vitest";
import { buscarTitulos, modificadosRecentemente, temTituloExato } from "./buscaTitulos";
import type { FileMeta } from "../indice/parser";

function meta(overrides: Partial<FileMeta> & { path: string }): FileMeta {
  return {
    kind: "note",
    mtimeMs: 0,
    size: 0,
    title: overrides.title ?? overrides.path,
    aliases: [],
    headings: [],
    blockIds: [],
    outLinks: [],
    embeds: [],
    ...overrides,
  };
}

function indiceDe(itens: FileMeta[]): Map<string, FileMeta> {
  return new Map(itens.map((m) => [m.path, m]));
}

describe("buscarTitulos", () => {
  it("ranking: igual > começa com > contém palavra que começa com > contém > caminho contém", () => {
    const indice = indiceDe([
      meta({ path: "Projeto.md", title: "Projeto" }), // igual
      meta({ path: "Projeto X.md", title: "Projeto X" }), // começa com
      meta({ path: "Meu Projeto.md", title: "Meu Projeto" }), // contém palavra que começa com
      meta({ path: "Reprojeto.md", title: "Reprojeto" }), // contém (sem palavra própria)
      meta({ path: "pasta-projeto/Nota.md", title: "Nota" }), // só o caminho contém
    ]);

    const resultados = buscarTitulos("projeto", 10, indice);

    expect(resultados.map((r) => r.path)).toEqual([
      "Projeto.md",
      "Projeto X.md",
      "Meu Projeto.md",
      "Reprojeto.md",
      "pasta-projeto/Nota.md",
    ]);
  });

  it("acento: 'reuniao' acha 'Reunião'", () => {
    const indice = indiceDe([meta({ path: "Reuniao semanal.md", title: "Reunião semanal" })]);
    const resultados = buscarTitulos("reuniao", 6, indice);
    expect(resultados.map((r) => r.titulo)).toEqual(["Reunião semanal"]);
  });

  it("casa por nome do arquivo quando o título (H1) é diferente", () => {
    const indice = indiceDe([meta({ path: "Notas/Projeto.md", title: "Outro título" })]);
    expect(buscarTitulos("projeto", 6, indice).map((r) => r.path)).toEqual(["Notas/Projeto.md"]);
  });

  it("casa por alias", () => {
    const indice = indiceDe([
      meta({ path: "A.md", title: "Alfa", aliases: ["Codinome"] }),
    ]);
    expect(buscarTitulos("codinome", 6, indice).map((r) => r.path)).toEqual(["A.md"]);
  });

  it("só notas e desenhos — anexo fica de fora mesmo com título casando", () => {
    const indice = indiceDe([
      meta({ path: "projeto.png", kind: "attachment", title: "projeto" }),
      meta({ path: "Projeto.md", title: "Projeto" }),
    ]);
    expect(buscarTitulos("projeto", 6, indice).map((r) => r.path)).toEqual(["Projeto.md"]);
  });

  it("um resultado por arquivo mesmo com vários rótulos casando", () => {
    const indice = indiceDe([
      meta({ path: "Projeto.md", title: "Projeto", aliases: ["Projeto antigo"] }),
    ]);
    expect(buscarTitulos("projeto", 6, indice)).toHaveLength(1);
  });

  it("pasta: caminho da pasta pai, vazio na raiz", () => {
    const indice = indiceDe([
      meta({ path: "Raiz.md", title: "Raiz" }),
      meta({ path: "Sub/Pasta/Nota.md", title: "Nota" }),
    ]);
    const resultados = buscarTitulos("nota", 6, indice);
    expect(resultados[0].pasta).toBe("Sub/Pasta");
    expect(buscarTitulos("raiz", 6, indice)[0].pasta).toBe("");
  });

  it("desenho é identificado como kind 'drawing'", () => {
    const indice = indiceDe([meta({ path: "Fluxo.draw.md", kind: "drawing", title: "Fluxo" })]);
    expect(buscarTitulos("fluxo", 6, indice)[0].kind).toBe("drawing");
  });

  it("respeita o limite", () => {
    const indice = indiceDe(
      Array.from({ length: 10 }, (_, i) => meta({ path: `Projeto ${i}.md`, title: `Projeto ${i}` })),
    );
    expect(buscarTitulos("projeto", 6, indice)).toHaveLength(6);
  });

  it("consulta vazia não acha nada", () => {
    const indice = indiceDe([meta({ path: "A.md", title: "A" })]);
    expect(buscarTitulos("", 6, indice)).toEqual([]);
  });
});

describe("modificadosRecentemente", () => {
  it("ordena por mtimeMs decrescente e respeita o limite padrão de 8", () => {
    const itens = Array.from({ length: 10 }, (_, i) =>
      meta({ path: `N${i}.md`, title: `N${i}`, mtimeMs: i }),
    );
    const resultados = modificadosRecentemente(undefined, indiceDe(itens));
    expect(resultados).toHaveLength(8);
    expect(resultados[0].path).toBe("N9.md");
    expect(resultados[7].path).toBe("N2.md");
  });

  it("anexos ficam de fora", () => {
    const indice = indiceDe([
      meta({ path: "foto.png", kind: "attachment", title: "foto", mtimeMs: 100 }),
      meta({ path: "N.md", title: "N", mtimeMs: 1 }),
    ]);
    expect(modificadosRecentemente(8, indice).map((r) => r.path)).toEqual(["N.md"]);
  });
});

describe("temTituloExato", () => {
  it("compara dobrado contra título, nome e aliases", () => {
    const indice = indiceDe([meta({ path: "Reuniao.md", title: "Reunião", aliases: ["RS"] })]);
    expect(temTituloExato("reuniao", indice)).toBe(true);
    expect(temTituloExato("rs", indice)).toBe(true);
    expect(temTituloExato("outra coisa", indice)).toBe(false);
  });

  it("não confunde 'começa com' com exato", () => {
    const indice = indiceDe([meta({ path: "Projeto X.md", title: "Projeto X" })]);
    expect(temTituloExato("projeto", indice)).toBe(false);
  });

  it("consulta vazia nunca é exata", () => {
    const indice = indiceDe([meta({ path: "A.md", title: "" })]);
    expect(temTituloExato("", indice)).toBe(false);
  });
});
