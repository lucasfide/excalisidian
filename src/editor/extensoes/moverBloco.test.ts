import { describe, it, expect } from "vitest";
import { ChangeSet, Text } from "@codemirror/state";
import { markdownLanguage } from "@codemirror/lang-markdown";

import { blocoEm, blocosIrmaos } from "./blocoMarkdown";
import { alvosDeSoltura, calcularMovimento, type AlvoSoltura } from "./moverBloco";

function preparar(texto: string, trechoDoBloco: string) {
  const arvore = markdownLanguage.parser.parse(texto);
  const doc = Text.of(texto.split("\n"));
  const alvo = blocoEm(arvore, doc, texto.indexOf(trechoDoBloco))!;
  const irmaos = blocosIrmaos(arvore, doc, alvo);
  const origem = irmaos.findIndex((b) => b.de === alvo.de);
  return { doc, irmaos, origem };
}

/** Índice do irmão cujo texto começa com `trecho`. */
function indiceDe(doc: Text, irmaos: { de: number; ate: number }[], trecho: string) {
  return irmaos.findIndex((b) => doc.sliceString(b.de, b.ate).startsWith(trecho));
}

function mover(texto: string, bloco: string, lado: AlvoSoltura["lado"], referencia: string) {
  const { doc, irmaos, origem } = preparar(texto, bloco);
  const alvo: AlvoSoltura = { indice: indiceDe(doc, irmaos, referencia), lado };
  const m = calcularMovimento(doc, irmaos, origem, alvo);
  if (!m) return null;
  const resultado = ChangeSet.of(m.changes, doc.length).apply(doc).toString();
  return { resultado, cursor: m.novaPosicaoCursor };
}

// A nota do relato: título, dois grupos separados por linha em branco, linhas feitas com Enter.
const NOTA = "# 17-09-26\n\nFAR:\nContato com Inovadora\n\nS2M:\nAlinhamento\nEscopo\nReunião";

describe("calcularMovimento", () => {
  it("linha feita com Enter move sozinha, sem levar as de baixo", () => {
    const r = mover(NOTA, "S2M:", "antes", "FAR:")!;
    expect(r.resultado).toBe(
      "# 17-09-26\n\nS2M:\nFAR:\nContato com Inovadora\n\nAlinhamento\nEscopo\nReunião",
    );
  });

  it("linhas em branco ficam no lugar: nada some, nada é acrescentado", () => {
    const r = mover(NOTA, "Escopo", "antes", "FAR:")!;
    expect(r.resultado).toBe(
      "# 17-09-26\n\nEscopo\nFAR:\nContato com Inovadora\n\nS2M:\nAlinhamento\nReunião",
    );
  });

  it("título colado no texto não gruda os parágrafos (bug do separador único)", () => {
    const texto = "# Título\num\n\ndois\n\ntrês";
    const r = mover(texto, "três", "antes", "dois")!;
    expect(r.resultado).toBe("# Título\num\n\ntrês\ndois");
  });

  it("título com duas linhas em branco não espalha linha em branco pelos outros", () => {
    const texto = "# Título\n\n\num\n\ndois\n\ntrês";
    const r = mover(texto, "um", "depois", "três")!;
    expect(r.resultado).toBe("# Título\n\n\ndois\n\ntrês\num");
  });

  it("soltar logo depois do grupo de cima (antes da linha em branco) entra no grupo", () => {
    const r = mover(NOTA, "Reunião", "depois", "Contato")!;
    expect(r.resultado).toBe(
      "# 17-09-26\n\nFAR:\nContato com Inovadora\nReunião\n\nS2M:\nAlinhamento\nEscopo",
    );
  });

  it("bloco ilhado por linha em branco dos dois lados não deixa duas linhas em branco", () => {
    const texto = "# T\n\num\n\ndois\n\ntrês";
    const r = mover(texto, "dois", "depois", "três")!;
    expect(r.resultado).toBe("# T\n\num\n\ntrês\ndois");
  });

  it("Shift+Enter (hard break) mantém as linhas juntas no movimento", () => {
    const texto = "# T\n\num\nlinha a  \nlinha b\ndois";
    const r = mover(texto, "linha b", "antes", "um")!;
    expect(r.resultado).toBe("# T\n\nlinha a  \nlinha b\num\ndois");
  });

  it("colar parágrafo embaixo de citação ganha linha em branco (senão viraria continuação)", () => {
    const texto = "# T\n\n> citação\n\num\ndois";
    const r = mover(texto, "dois", "depois", "> citação")!;
    expect(r.resultado).toBe("# T\n\n> citação\n\ndois\n\num");
  });

  it("soltar no próprio lugar não muda nada", () => {
    const { doc, irmaos, origem } = preparar(NOTA, "Escopo");
    expect(calcularMovimento(doc, irmaos, origem, { indice: origem, lado: "antes" })).toBeNull();
    expect(calcularMovimento(doc, irmaos, origem, { indice: origem - 1, lado: "depois" })).toBeNull();
    expect(calcularMovimento(doc, irmaos, origem, { indice: origem + 1, lado: "antes" })).toBeNull();
  });

  it("um irmão só: nada pra mover", () => {
    const { doc, irmaos } = preparar("único parágrafo", "único");
    expect(calcularMovimento(doc, irmaos, 0, { indice: 0, lado: "antes" })).toBeNull();
  });

  it("item de lista: mantém a quebra simples da lista compacta", () => {
    const r = mover("- um\n- dois\n- três", "- um", "depois", "- três")!;
    expect(r.resultado).toBe("- dois\n- três\n- um");
  });

  it("item de lista aninhado: a indentação vai junto e não sobra no lugar antigo", () => {
    const texto = "- pai\n  - a\n  - b\n  - c";
    const r = mover(texto, "c", "antes", "- a")!;
    expect(r.resultado).toBe("- pai\n  - c\n  - a\n  - b");
  });

  it("posição do cursor cai no início do bloco movido, na nova posição", () => {
    const r = mover(NOTA, "Escopo", "antes", "FAR:")!;
    expect(r.resultado.slice(r.cursor, r.cursor + 6)).toBe("Escopo");
    const r2 = mover(NOTA, "FAR:", "depois", "Reunião")!;
    expect(r2.resultado.slice(r2.cursor, r2.cursor + 4)).toBe("FAR:");
  });
});

describe("alvosDeSoltura", () => {
  it("nunca oferece soltar antes do título (linha 1)", () => {
    const { doc, irmaos } = preparar(NOTA, "FAR:");
    const alvos = alvosDeSoltura(doc, irmaos);
    expect(alvos.some((a) => a.indice === 0 && a.lado === "antes")).toBe(false);
  });

  it("linhas coladas têm um alvo só entre elas; linha em branco dá dois", () => {
    const { doc, irmaos } = preparar("# T\n\num\ndois\n\ntrês", "um");
    const alvos = alvosDeSoltura(doc, irmaos).map(
      (a) => `${a.lado}:${doc.sliceString(irmaos[a.indice].de, irmaos[a.indice].ate)}`,
    );
    expect(alvos).toEqual(["depois:# T", "antes:um", "antes:dois", "depois:dois", "antes:três", "depois:três"]);
  });
});
