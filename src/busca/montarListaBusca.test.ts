import { describe, it, expect } from "vitest";
import { montarListaBusca, type ParametrosListaBusca } from "./montarListaBusca";
import type { ResultadoTitulo } from "./buscaTitulos";
import type { ResultadoConteudo } from "./minisearchIndex";

function titulo(overrides: Partial<ResultadoTitulo> & { path: string }): ResultadoTitulo {
  return { titulo: overrides.path, kind: "note", pasta: "", ...overrides };
}

function conteudo(overrides: Partial<ResultadoConteudo> & { path: string }): ResultadoConteudo {
  return { titulo: overrides.path, kind: "note", trechos: [], ...overrides };
}

function base(): ParametrosListaBusca {
  return {
    consulta: "",
    recentes: [],
    titulos: [],
    conteudo: [],
    buscandoConteudo: false,
    temTituloExato: false,
  };
}

describe("montarListaBusca", () => {
  it("consulta vazia: só 'Modificados recentemente', todos navegáveis", () => {
    const recentes = [titulo({ path: "A.md" }), titulo({ path: "B.md" })];
    const { linhas, itens } = montarListaBusca({ ...base(), recentes });
    expect(linhas).toEqual([
      { tipo: "secao", texto: "Modificados recentemente" },
      { tipo: "item", indice: 0 },
      { tipo: "item", indice: 1 },
    ]);
    expect(itens).toEqual([
      { tipo: "recente", item: recentes[0] },
      { tipo: "recente", item: recentes[1] },
    ]);
  });

  it("consulta vazia e vault sem nada: lista vazia, sem cabeçalho solto", () => {
    const { linhas, itens } = montarListaBusca(base());
    expect(linhas).toEqual([]);
    expect(itens).toEqual([]);
  });

  it("ordem das seções: Títulos, depois No conteúdo, depois Criar", () => {
    const t = titulo({ path: "T.md" });
    const c = conteudo({ path: "C.md", trechos: [{ linha: 1, trecho: "x", linhaCompleta: "x" }] });
    const { linhas, itens } = montarListaBusca({
      ...base(),
      consulta: "x",
      titulos: [t],
      conteudo: [c],
      temTituloExato: false,
    });
    expect(linhas.map((l) => l.tipo)).toEqual([
      "secao", // Títulos
      "item",
      "secao", // No conteúdo
      "arquivo",
      "item",
      "item", // Criar nota
    ]);
    expect(itens[0]).toEqual({ tipo: "titulo", item: t });
    expect(itens[1]).toEqual({ tipo: "trecho", resultado: c, trecho: c.trechos[0] });
    expect(itens[2]).toEqual({ tipo: "criar", consulta: "x" });
  });

  it("dedupe título×conteúdo: arquivo que só casou pelo título (sem trecho) não aparece em 'No conteúdo'", () => {
    const soTitulo = conteudo({ path: "SoTitulo.md", trechos: [] });
    const comTrecho = conteudo({
      path: "ComTrecho.md",
      trechos: [{ linha: 3, trecho: "y", linhaCompleta: "y" }],
    });
    const { linhas, itens } = montarListaBusca({
      ...base(),
      consulta: "y",
      conteudo: [soTitulo, comTrecho],
      temTituloExato: true, // sem item "Criar", pra isolar a seção de conteúdo
    });
    expect(linhas).toEqual([
      { tipo: "secao", texto: "No conteúdo" },
      { tipo: "arquivo", resultado: comTrecho },
      { tipo: "item", indice: 0 },
    ]);
    expect(itens).toEqual([{ tipo: "trecho", resultado: comTrecho, trecho: comTrecho.trechos[0] }]);
  });

  it("nenhum trecho e conteúdo não carregando: seção 'No conteúdo' nem aparece", () => {
    const soTitulo = conteudo({ path: "SoTitulo.md", trechos: [] });
    const { linhas } = montarListaBusca({
      ...base(),
      consulta: "y",
      conteudo: [soTitulo],
      temTituloExato: true,
    });
    expect(linhas).toEqual([]);
  });

  it("buscandoConteudo: mostra 'Buscando no conteúdo…' sem apagar Títulos e sem escoder trechos ainda", () => {
    const t = titulo({ path: "T.md" });
    const { linhas, itens } = montarListaBusca({
      ...base(),
      consulta: "x",
      titulos: [t],
      buscandoConteudo: true,
      temTituloExato: true, // sem 'Criar' pra isolar
    });
    expect(linhas).toEqual([
      { tipo: "secao", texto: "Títulos" },
      { tipo: "item", indice: 0 },
      { tipo: "secao", texto: "No conteúdo" },
      { tipo: "carregando", texto: "Buscando no conteúdo…" },
    ]);
    expect(itens).toEqual([{ tipo: "titulo", item: t }]);
  });

  it("item 'Criar nota' só aparece quando não há título exato", () => {
    const semExato = montarListaBusca({ ...base(), consulta: "nova", temTituloExato: false });
    expect(semExato.itens).toEqual([{ tipo: "criar", consulta: "nova" }]);

    const comExato = montarListaBusca({ ...base(), consulta: "nova", temTituloExato: true });
    expect(comExato.itens).toEqual([]);
  });

  it("consulta é cortada nas pontas antes de virar o texto de 'Criar'", () => {
    const { itens } = montarListaBusca({ ...base(), consulta: "  nova nota  " });
    expect(itens).toEqual([{ tipo: "criar", consulta: "nova nota" }]);
  });

  it("índice de 'item' bate com a posição em itens, atravessando as duas seções", () => {
    const t1 = titulo({ path: "T1.md" });
    const t2 = titulo({ path: "T2.md" });
    const c = conteudo({ path: "C.md", trechos: [{ linha: 1, trecho: "z", linhaCompleta: "z" }] });
    const { linhas, itens } = montarListaBusca({
      ...base(),
      consulta: "z",
      titulos: [t1, t2],
      conteudo: [c],
      temTituloExato: true,
    });
    const indicesItem = linhas
      .filter((l): l is { tipo: "item"; indice: number } => l.tipo === "item")
      .map((l) => l.indice);
    expect(indicesItem).toEqual([0, 1, 2]);
    expect(itens).toHaveLength(3);
  });
});
