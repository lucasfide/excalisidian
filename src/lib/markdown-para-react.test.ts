import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { converterMarkdown, gerarIdTitulo } from "./markdown-para-react";

const amostra = [
  "# Título principal",
  "",
  "## 1. Quem somos",
  "",
  "Texto com **negrito**, *itálico*, `código` e [link externo](https://exemplo.com) e [interno](/termos/).",
  "Razão social: [[RAZAO_SOCIAL]]",
  "",
  "- item um",
  "- item dois",
  "",
  "3. terceiro",
  "4. quarto",
  "",
  "## 1. Quem somos",
  "",
  "| Coluna | Valor |",
  "|---|---:|",
  "| a | 1 |",
  "",
  "---",
  "",
  "> citação",
  "",
  "<script>alert(1)</script>",
].join("\n");

function html(md: string) {
  const { elementos } = converterMarkdown(md);
  return renderToStaticMarkup(createElement(Fragment, null, ...elementos));
}

describe("converterMarkdown", () => {
  const saida = html(amostra);

  it("gera títulos com id e sumário dos ##, com ids únicos", () => {
    expect(saida).toContain('<h1 id="titulo-principal">Título principal</h1>');
    expect(saida).toContain('<h2 id="1-quem-somos">1. Quem somos</h2>');
    expect(saida).toContain('<h2 id="1-quem-somos-2">');
    expect(converterMarkdown(amostra).sumario.map(s => s.id)).toEqual(["1-quem-somos", "1-quem-somos-2"]);
  });

  it("converte ênfase, código e links", () => {
    expect(saida).toContain("<strong>negrito</strong>");
    expect(saida).toContain("<em>itálico</em>");
    expect(saida).toContain("<code>código</code>");
    expect(saida).toContain('<a href="https://exemplo.com" target="_blank" rel="noreferrer noopener">link externo</a>');
    expect(saida).toContain('<a href="/termos/">interno</a>');
  });

  it("mantém os marcadores [[...]] como estão", () => {
    expect(saida).toContain("[[RAZAO_SOCIAL]]");
  });

  it("converte listas, tabela, separador e citação", () => {
    expect(saida).toContain("<ul><li>item um</li><li>item dois</li></ul>");
    expect(saida).toContain('<ol start="3">');
    expect(saida).toContain("<table>");
    expect(saida).toContain('<th style="text-align:right">Valor</th>');
    expect(saida).toContain("<hr/>");
    expect(saida).toContain("<blockquote>");
  });

  it("não injeta HTML cru", () => {
    expect(saida).not.toContain("<script>");
    expect(saida).toContain("&lt;script&gt;");
  });

  it("gerarIdTitulo tira acento e pontuação", () => {
    expect(gerarIdTitulo("Política: 3. Ação!")).toBe("politica-3-acao");
  });
});
