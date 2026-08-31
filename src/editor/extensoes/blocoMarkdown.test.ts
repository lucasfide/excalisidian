import { describe, it, expect } from "vitest";
import { Text } from "@codemirror/state";
import { markdownLanguage } from "@codemirror/lang-markdown";

import { blocoEm, blocosIrmaos } from "./blocoMarkdown";

// Mesmo parser que o editor de verdade usa (AtomicCodeMirrorEditor.tsx: markdown({ base:
// markdownLanguage, ... })) — sem precisar de EditorView/DOM.
function arvoreDe(texto: string) {
  return { arvore: markdownLanguage.parser.parse(texto), doc: Text.of(texto.split("\n")) };
}

describe("blocoEm", () => {
  it("parágrafo de uma linha só", () => {
    const { arvore, doc } = arvoreDe("Olá mundo.");
    const b = blocoEm(arvore, doc, 3);
    expect(b).toEqual({ de: 0, ate: 10, tipo: "Paragraph" });
  });

  it("parágrafo de várias linhas (Shift+Enter): o bloco inteiro, não só a linha", () => {
    const texto = "linha um\nlinha dois\nlinha três";
    const { arvore, doc } = arvoreDe(texto);
    const b = blocoEm(arvore, doc, texto.indexOf("dois"));
    expect(b).toEqual({ de: 0, ate: texto.length, tipo: "Paragraph" });
  });

  it("dois parágrafos separados por linha em branco são blocos diferentes", () => {
    const texto = "primeiro\n\nsegundo";
    const { arvore, doc } = arvoreDe(texto);
    const b1 = blocoEm(arvore, doc, 3);
    const b2 = blocoEm(arvore, doc, texto.indexOf("segundo") + 2);
    expect(b1).toEqual({ de: 0, ate: 8, tipo: "Paragraph" });
    expect(b2).toEqual({ de: 10, ate: 17, tipo: "Paragraph" });
  });

  it("heading é o bloco inteiro (doc 09 ADR-18: título move só a linha, mas o bloco do H1 é a linha do heading)", () => {
    const texto = "## Funções novas\ncorpo";
    const { arvore, doc } = arvoreDe(texto);
    const b = blocoEm(arvore, doc, 5);
    expect(b).toEqual({ de: 0, ate: 16, tipo: "ATXHeading2" });
  });

  it("item de lista: o bloco é o ListItem, não a BulletList inteira", () => {
    const texto = "- um\n- dois\n- três";
    const { arvore, doc } = arvoreDe(texto);
    const b = blocoEm(arvore, doc, texto.indexOf("dois"));
    expect(b?.tipo).toBe("ListItem");
    expect(doc.sliceString(b!.de, b!.ate)).toBe("- dois");
  });

  it("citação (blockquote) é um bloco só", () => {
    const texto = "> linha um\n> linha dois";
    const { arvore, doc } = arvoreDe(texto);
    const b = blocoEm(arvore, doc, 5);
    expect(b?.tipo).toBe("Blockquote");
    expect(b?.de).toBe(0);
    expect(b?.ate).toBe(texto.length);
  });

  it("bloco de código cercado é um bloco só, mesmo com '#'/'-' dentro", () => {
    const texto = "```\n# não é heading\n- não é lista\n```";
    const { arvore, doc } = arvoreDe(texto);
    const b = blocoEm(arvore, doc, texto.indexOf("não é heading"));
    expect(b?.tipo).toBe("FencedCode");
    expect(b?.de).toBe(0);
    expect(b?.ate).toBe(texto.length);
  });

  it("posição numa linha em branco entre blocos: null", () => {
    const texto = "um\n\ndois";
    const { arvore, doc } = arvoreDe(texto);
    expect(blocoEm(arvore, doc, 3)).toBe(null);
  });

  it("`ate` nunca inclui a quebra de linha final (é isso que corrige o clique triplo)", () => {
    const texto = "bloco a\n\nbloco b";
    const { arvore, doc } = arvoreDe(texto);
    const a = blocoEm(arvore, doc, 3)!;
    expect(doc.sliceString(a.ate, a.ate + 1)).toBe("\n"); // logo depois do bloco, não dentro
    expect(doc.sliceString(a.de, a.ate)).toBe("bloco a");
  });
});

describe("blocosIrmaos", () => {
  it("parágrafos no nível do documento são irmãos entre si", () => {
    const texto = "um\n\ndois\n\ntrês";
    const { arvore, doc } = arvoreDe(texto);
    const meio = blocoEm(arvore, doc, texto.indexOf("dois"))!;
    const irmaos = blocosIrmaos(arvore, doc, meio);
    expect(irmaos.map((b) => doc.sliceString(b.de, b.ate))).toEqual(["um", "dois", "três"]);
  });

  it("itens de lista são irmãos só entre si, não com parágrafos ao redor", () => {
    const texto = "antes\n\n- um\n- dois\n\ndepois";
    const { arvore, doc } = arvoreDe(texto);
    const item = blocoEm(arvore, doc, texto.indexOf("dois"))!;
    const irmaos = blocosIrmaos(arvore, doc, item);
    expect(irmaos).toHaveLength(2);
    expect(irmaos.every((b) => b.tipo === "ListItem")).toBe(true);
  });
});
