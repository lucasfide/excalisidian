import { describe, it, expect } from "vitest";
import { Text } from "@codemirror/state";
import { markdownLanguage } from "@codemirror/lang-markdown";

import { blocoEm, blocosIrmaos } from "./blocoMarkdown";
import { calcularMovimento } from "./moverBloco";

function irmaosDe(texto: string, posNoAlvo: number) {
  const arvore = markdownLanguage.parser.parse(texto);
  const doc = Text.of(texto.split("\n"));
  const alvo = blocoEm(arvore, doc, posNoAlvo)!;
  return { doc, irmaos: blocosIrmaos(arvore, doc, alvo) };
}

describe("calcularMovimento", () => {
  it("primeiro bloco pra depois do último", () => {
    const texto = "um\n\ndois\n\ntrês";
    const { doc, irmaos } = irmaosDe(texto, 0);
    const m = calcularMovimento(doc, irmaos, 0, 3)!;
    expect(m).not.toBeNull();
    const resultado = doc.sliceString(0, m.from) + m.insert + doc.sliceString(m.to);
    expect(resultado).toBe("dois\n\ntrês\n\num");
  });

  it("último bloco pra antes do primeiro", () => {
    const texto = "um\n\ndois\n\ntrês";
    const { doc, irmaos } = irmaosDe(texto, texto.indexOf("três"));
    const m = calcularMovimento(doc, irmaos, 2, 0)!;
    const resultado = doc.sliceString(0, m.from) + m.insert + doc.sliceString(m.to);
    expect(resultado).toBe("três\n\num\n\ndois");
  });

  it("bloco do meio troca de lugar com o vizinho seguinte", () => {
    const texto = "um\n\ndois\n\ntrês";
    const { doc, irmaos } = irmaosDe(texto, texto.indexOf("dois"));
    const m = calcularMovimento(doc, irmaos, 1, 3)!;
    const resultado = doc.sliceString(0, m.from) + m.insert + doc.sliceString(m.to);
    expect(resultado).toBe("um\n\ntrês\n\ndois");
  });

  it("soltar no mesmo lugar (destino === origem) não muda nada", () => {
    const texto = "um\n\ndois\n\ntrês";
    const { doc, irmaos } = irmaosDe(texto, texto.indexOf("dois"));
    expect(calcularMovimento(doc, irmaos, 1, 1)).toBeNull();
  });

  it("soltar logo depois de si mesmo (destino === origem + 1) não muda nada", () => {
    const texto = "um\n\ndois\n\ntrês";
    const { doc, irmaos } = irmaosDe(texto, texto.indexOf("dois"));
    expect(calcularMovimento(doc, irmaos, 1, 2)).toBeNull();
  });

  it("um irmão só: nada pra mover", () => {
    const { doc, irmaos } = irmaosDe("único parágrafo", 0);
    expect(calcularMovimento(doc, irmaos, 0, 0)).toBeNull();
  });

  it("item de lista: separador de quebra simples, não linha em branco", () => {
    const texto = "- um\n- dois\n- três";
    const { doc, irmaos } = irmaosDe(texto, texto.indexOf("dois"));
    const m = calcularMovimento(doc, irmaos, 0, 3)!;
    const resultado = doc.sliceString(0, m.from) + m.insert + doc.sliceString(m.to);
    expect(resultado).toBe("- dois\n- três\n- um");
  });

  it("posição do cursor cai no início do bloco movido, na nova posição", () => {
    const texto = "um\n\ndois\n\ntrês";
    const { doc, irmaos } = irmaosDe(texto, 0);
    const m = calcularMovimento(doc, irmaos, 0, 3)!;
    const resultado = doc.sliceString(0, m.from) + m.insert + doc.sliceString(m.to);
    expect(resultado.slice(m.novaPosicaoCursor, m.novaPosicaoCursor + 2)).toBe("um");
  });
});
