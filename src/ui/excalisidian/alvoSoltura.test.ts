// src/ui/excalisidian/alvoSoltura.test.ts
import { describe, it, expect } from "vitest";

import { pastaDe, nomeBase } from "../../vault/caminhos";
import { calcularAlvo, calcularNovaOrdem, type LinhaGeometria, type ItemArrastado } from "./alvoSoltura";

const ALTURA_NO = 26;
const ALTURA_SEP = 16;

type EspecLinha =
  | { tipo: "no"; path: string; ehPasta?: boolean }
  | { tipo: "separador"; chave: string };

function no(path: string, ehPasta = false): EspecLinha {
  return { tipo: "no", path, ehPasta };
}
function sep(chave: string): EspecLinha {
  return { tipo: "separador", chave };
}

/** Monta as linhas acumulando `inicio` (26 por nó, 16 por separador), derivando `pasta` de
 * `pastaDe`, `chave` de `nomeBase` (ou o próprio id pro separador) e `nivel` da profundidade
 * do caminho (0 = raiz). */
function montarLinhas(especs: EspecLinha[]): LinhaGeometria[] {
  let inicio = 0;
  return especs.map((e) => {
    if (e.tipo === "separador") {
      const linha: LinhaGeometria = {
        tipo: "separador",
        chave: e.chave,
        path: e.chave,
        pasta: "",
        ehPasta: false,
        nivel: 0,
        inicio,
        altura: ALTURA_SEP,
      };
      inicio += ALTURA_SEP;
      return linha;
    }
    const pasta = pastaDe(e.path);
    const nivel = e.path.split("/").length - 1;
    const linha: LinhaGeometria = {
      tipo: "no",
      chave: nomeBase(e.path),
      path: e.path,
      pasta,
      ehPasta: e.ehPasta ?? false,
      nivel,
      inicio,
      altura: ALTURA_NO,
    };
    inicio += ALTURA_NO;
    return linha;
  });
}

function itemArquivo(path: string): ItemArrastado {
  return { tipo: "no", chave: nomeBase(path), path, pasta: pastaDe(path), ehPasta: false };
}
function itemPasta(path: string): ItemArrastado {
  return { tipo: "no", chave: nomeBase(path), path, pasta: pastaDe(path), ehPasta: true };
}
function itemSeparador(chave: string): ItemArrastado {
  return { tipo: "separador", chave };
}

// Cenário base (raiz simples):
// A.md [0-26] · Pasta (fechada) [26-52] · B.md [52-78] · sep-001 [78-94] · C.md [94-120]
function linhasBase(): LinhaGeometria[] {
  return montarLinhas([no("A.md"), no("Pasta", true), no("B.md"), sep("sep-001"), no("C.md")]);
}
const ALTURA_ARVORE_BASE = 120;

describe("calcularNovaOrdem", () => {
  it("insere no início", () => {
    expect(calcularNovaOrdem(["A", "B", "C"], "C", "A")).toEqual(["C", "A", "B"]);
  });

  it("insere no meio", () => {
    expect(calcularNovaOrdem(["A", "B", "C"], "A", "C")).toEqual(["B", "A", "C"]);
  });

  it("insere no fim (antesDe null)", () => {
    expect(calcularNovaOrdem(["A", "B", "C"], "A", null)).toEqual(["B", "C", "A"]);
  });

  it("antesDe inexistente devolve null", () => {
    expect(calcularNovaOrdem(["A", "B", "C"], "A", "Z")).toBeNull();
  });

  it("sem mudança (já está ali) devolve null", () => {
    expect(calcularNovaOrdem(["A", "B", "C"], "B", "C")).toBeNull();
    expect(calcularNovaOrdem(["A", "B", "C"], "C", null)).toBeNull();
  });

  it("não muta a entrada", () => {
    const base = ["A", "B", "C"];
    calcularNovaOrdem(base, "C", "A");
    expect(base).toEqual(["A", "B", "C"]);
  });
});

describe("calcularAlvo — arrastando arquivo, linha sob o cursor é a própria ou descendente", () => {
  it("própria linha do item: nenhum alvo", () => {
    const linhas = linhasBase();
    const ctx = {
      linhas,
      y: 5, // dentro de A.md
      item: itemArquivo("A.md"),
      modo: "custom" as const,
      alturaArvore: ALTURA_ARVORE_BASE,
      alturaFaixaRaiz: 32,
    };
    expect(calcularAlvo(ctx)).toBeNull();
  });

  it("descendente do item (pasta aberta): nenhum alvo", () => {
    const linhas = montarLinhas([no("Projetos", true), no("Projetos/A.md"), no("Zebra.md")]);
    const ctx = {
      linhas,
      y: 30, // dentro de Projetos/A.md
      item: itemPasta("Projetos"),
      modo: "custom" as const,
      alturaArvore: 78,
      alturaFaixaRaiz: 0,
    };
    expect(calcularAlvo(ctx)).toBeNull();
  });
});

describe("calcularAlvo — irmã que é pasta, item é arquivo (25/50/25)", () => {
  it("modo custom, 25% de cima: reordenar antes dela", () => {
    const linhas = linhasBase();
    // C.md (não A.md, que já está logo antes de Pasta — seria sem efeito) pra cima de Pasta.
    const alvo = calcularAlvo({
      linhas,
      y: 26 + 3, // topo de Pasta [26-52]
      item: itemArquivo("C.md"),
      modo: "custom",
      alturaArvore: ALTURA_ARVORE_BASE,
      alturaFaixaRaiz: 32,
    });
    expect(alvo).toEqual({ tipo: "reordenar", pasta: "", antesDe: "Pasta", y: 26, nivel: 0 });
  });

  it("modo custom, 50% do meio: mover pra dentro dela", () => {
    const linhas = linhasBase();
    const alvo = calcularAlvo({
      linhas,
      y: 26 + 13, // meio de Pasta
      item: itemArquivo("A.md"),
      modo: "custom",
      alturaArvore: ALTURA_ARVORE_BASE,
      alturaFaixaRaiz: 32,
    });
    expect(alvo).toEqual({ tipo: "mover", pasta: "Pasta" });
  });

  it("modo custom, 25% de baixo: reordenar depois dela (bloco fechado = ela mesma)", () => {
    const linhas = linhasBase();
    const alvo = calcularAlvo({
      linhas,
      y: 26 + 24, // base de Pasta
      item: itemArquivo("A.md"),
      modo: "custom",
      alturaArvore: ALTURA_ARVORE_BASE,
      alturaFaixaRaiz: 32,
    });
    expect(alvo).toEqual({ tipo: "reordenar", pasta: "", antesDe: "B.md", y: 52, nivel: 0 });
  });

  it("modo alphabetical: mover pra dentro dela em qualquer posição (topo)", () => {
    const linhas = linhasBase();
    const alvo = calcularAlvo({
      linhas,
      y: 26 + 3,
      item: itemArquivo("A.md"),
      modo: "alphabetical",
      alturaArvore: ALTURA_ARVORE_BASE,
      alturaFaixaRaiz: 32,
    });
    expect(alvo).toEqual({ tipo: "mover", pasta: "Pasta" });
  });

  it("modo alphabetical: mover pra dentro dela em qualquer posição (base)", () => {
    const linhas = linhasBase();
    const alvo = calcularAlvo({
      linhas,
      y: 26 + 24,
      item: itemArquivo("A.md"),
      modo: "alphabetical",
      alturaArvore: ALTURA_ARVORE_BASE,
      alturaFaixaRaiz: 32,
    });
    expect(alvo).toEqual({ tipo: "mover", pasta: "Pasta" });
  });
});

describe("calcularAlvo — irmã em qualquer outro caso (metade/metade)", () => {
  it("irmã arquivo, custom, metade de cima: antes dela", () => {
    const linhas = linhasBase();
    const alvo = calcularAlvo({
      linhas,
      y: 52 + 5, // topo de B.md [52-78]
      item: itemArquivo("A.md"),
      modo: "custom",
      alturaArvore: ALTURA_ARVORE_BASE,
      alturaFaixaRaiz: 32,
    });
    expect(alvo).toEqual({ tipo: "reordenar", pasta: "", antesDe: "B.md", y: 52, nivel: 0 });
  });

  it("irmã arquivo, custom, metade de baixo: depois dela", () => {
    const linhas = linhasBase();
    const alvo = calcularAlvo({
      linhas,
      y: 52 + 20,
      item: itemArquivo("A.md"),
      modo: "custom",
      alturaArvore: ALTURA_ARVORE_BASE,
      alturaFaixaRaiz: 32,
    });
    expect(alvo).toEqual({ tipo: "reordenar", pasta: "", antesDe: "sep-001", y: 78, nivel: 0 });
  });

  it("irmã arquivo, alphabetical: nenhum alvo", () => {
    const linhas = linhasBase();
    const alvo = calcularAlvo({
      linhas,
      y: 52 + 5,
      item: itemArquivo("A.md"),
      modo: "alphabetical",
      alturaArvore: ALTURA_ARVORE_BASE,
      alturaFaixaRaiz: 32,
    });
    expect(alvo).toBeNull();
  });

  it("item pasta sobre irmã pasta, custom: metade de cima antes, nunca mover", () => {
    // PastaW (a última) pro topo de PastaX (a primeira) — PastaX pro topo de PastaY seria
    // sem efeito, já que PastaX já vem logo antes de PastaY.
    const linhas = montarLinhas([
      no("PastaX", true),
      no("PastaY", true),
      no("PastaW", true),
      no("Z.md"),
    ]);
    const alvo = calcularAlvo({
      linhas,
      y: 0 + 3, // topo de PastaX [0-26]
      item: itemPasta("PastaW"),
      modo: "custom",
      alturaArvore: 104,
      alturaFaixaRaiz: 0,
    });
    expect(alvo).toEqual({ tipo: "reordenar", pasta: "", antesDe: "PastaX", y: 0, nivel: 0 });
  });

  it("item pasta sobre irmã pasta, custom: metade de baixo depois, nunca mover", () => {
    const linhas = montarLinhas([no("PastaX", true), no("PastaY", true), no("Z.md")]);
    const alvo = calcularAlvo({
      linhas,
      y: 26 + 20, // base de PastaY
      item: itemPasta("PastaX"),
      modo: "custom",
      alturaArvore: 78,
      alturaFaixaRaiz: 0,
    });
    expect(alvo).toEqual({ tipo: "reordenar", pasta: "", antesDe: "Z.md", y: 52, nivel: 0 });
  });

  it("item pasta sobre irmã pasta, alphabetical: nenhum alvo (nunca mover)", () => {
    const linhas = montarLinhas([no("PastaX", true), no("PastaY", true), no("Z.md")]);
    const alvo = calcularAlvo({
      linhas,
      y: 26 + 13,
      item: itemPasta("PastaX"),
      modo: "alphabetical",
      alturaArvore: 78,
      alturaFaixaRaiz: 0,
    });
    expect(alvo).toBeNull();
  });
});

describe("calcularAlvo — separador (só se item está na raiz)", () => {
  it("custom, metade de cima: antes do separador", () => {
    const linhas = linhasBase();
    const alvo = calcularAlvo({
      linhas,
      y: 78 + 3, // topo de sep-001 [78-94]
      item: itemArquivo("A.md"),
      modo: "custom",
      alturaArvore: ALTURA_ARVORE_BASE,
      alturaFaixaRaiz: 32,
    });
    expect(alvo).toEqual({ tipo: "reordenar", pasta: "", antesDe: "sep-001", y: 78, nivel: 0 });
  });

  it("custom, metade de baixo: depois do separador", () => {
    const linhas = linhasBase();
    const alvo = calcularAlvo({
      linhas,
      y: 78 + 13,
      item: itemArquivo("A.md"),
      modo: "custom",
      alturaArvore: ALTURA_ARVORE_BASE,
      alturaFaixaRaiz: 32,
    });
    expect(alvo).toEqual({ tipo: "reordenar", pasta: "", antesDe: "C.md", y: 94, nivel: 0 });
  });

  it("item fora da raiz sobre separador: nenhum alvo", () => {
    const linhas = montarLinhas([no("Projetos", true), no("Projetos/X.md"), sep("sep-001")]);
    const alvo = calcularAlvo({
      linhas,
      y: 52 + 5, // dentro de sep-001 [52-68]
      item: itemArquivo("Projetos/X.md"),
      modo: "custom",
      alturaArvore: 68,
      alturaFaixaRaiz: 0,
    });
    expect(alvo).toBeNull();
  });

  it("item na raiz, alphabetical, sobre separador: nenhum alvo", () => {
    const linhas = linhasBase();
    const alvo = calcularAlvo({
      linhas,
      y: 78 + 3,
      item: itemArquivo("A.md"),
      modo: "alphabetical",
      alturaArvore: ALTURA_ARVORE_BASE,
      alturaFaixaRaiz: 32,
    });
    expect(alvo).toBeNull();
  });
});

describe("calcularAlvo — pasta que não é a pasta do item, item é arquivo: mover, qualquer modo", () => {
  function linhasComOutra(): LinhaGeometria[] {
    return montarLinhas([no("Projetos", true), no("Projetos/Nota.md"), no("Outra", true)]);
  }

  it("modo custom", () => {
    const linhas = linhasComOutra();
    const alvo = calcularAlvo({
      linhas,
      y: 52 + 10, // dentro de Outra [52-78]
      item: itemArquivo("Projetos/Nota.md"),
      modo: "custom",
      alturaArvore: 78,
      alturaFaixaRaiz: 0,
    });
    expect(alvo).toEqual({ tipo: "mover", pasta: "Outra" });
  });

  it("modo alphabetical", () => {
    const linhas = linhasComOutra();
    const alvo = calcularAlvo({
      linhas,
      y: 52 + 10,
      item: itemArquivo("Projetos/Nota.md"),
      modo: "alphabetical",
      alturaArvore: 78,
      alturaFaixaRaiz: 0,
    });
    expect(alvo).toEqual({ tipo: "mover", pasta: "Outra" });
  });

  it("hover sobre a própria pasta do item (Projetos): nenhum alvo", () => {
    const linhas = linhasComOutra();
    const alvo = calcularAlvo({
      linhas,
      y: 5, // dentro de Projetos [0-26]
      item: itemArquivo("Projetos/Nota.md"),
      modo: "custom",
      alturaArvore: 78,
      alturaFaixaRaiz: 0,
    });
    expect(alvo).toBeNull();
  });
});

describe("calcularAlvo — 'qualquer outra': nenhum alvo", () => {
  it("irmã arquivo em modo alphabetical já coberto acima; aqui: pasta não-irmã com item pasta", () => {
    const linhas = montarLinhas([no("Projetos", true), no("Projetos/Sub", true), no("Outra", true)]);
    const alvo = calcularAlvo({
      linhas,
      y: 52 + 5, // Outra [52-78]
      item: itemPasta("Projetos/Sub"),
      modo: "custom",
      alturaArvore: 78,
      alturaFaixaRaiz: 0,
    });
    expect(alvo).toBeNull();
  });
});

describe("calcularAlvo — 'depois de' pasta aberta pula todos os descendentes", () => {
  it("depois de Projetos (aberta, com 2 filhos) cai antes de Zebra.md, não entre os filhos", () => {
    const linhas = montarLinhas([
      no("Projetos", true),
      no("Projetos/A.md"),
      no("Projetos/B.md"),
      no("Zebra.md"),
    ]);
    const alturaArvore = 26 + 26 + 26 + 26; // 104
    const alvo = calcularAlvo({
      linhas,
      y: 22, // base de Projetos [0-26], 25% de baixo (item arquivo, irmã pasta)
      item: itemArquivo("Novo.md"),
      modo: "custom",
      alturaArvore,
      alturaFaixaRaiz: 32,
    });
    expect(alvo).toEqual({ tipo: "reordenar", pasta: "", antesDe: "Zebra.md", y: 78, nivel: 0 });
  });
});

describe("calcularAlvo — abaixo da última linha, faixa 'raiz do vault'", () => {
  it("item arquivo fora da raiz, dentro da faixa: mover pra raiz", () => {
    const linhas = montarLinhas([no("Projetos", true), no("Projetos/A.md")]);
    const alvo = calcularAlvo({
      linhas,
      y: 52 + 10, // abaixo da árvore [52], dentro da faixa [52-84]
      item: itemArquivo("Projetos/A.md"),
      modo: "custom",
      alturaArvore: 52,
      alturaFaixaRaiz: 32,
    });
    expect(alvo).toEqual({ tipo: "mover", pasta: "" });
  });

  it("item na raiz, modo custom, dentro da faixa: reordenar no fim da raiz", () => {
    const linhas = linhasBase();
    const alvo = calcularAlvo({
      linhas,
      y: ALTURA_ARVORE_BASE + 10,
      item: itemArquivo("A.md"),
      modo: "custom",
      alturaArvore: ALTURA_ARVORE_BASE,
      alturaFaixaRaiz: 32,
    });
    expect(alvo).toEqual({ tipo: "reordenar", pasta: "", antesDe: null, y: ALTURA_ARVORE_BASE, nivel: 0 });
  });

  it("item na raiz, modo alphabetical, dentro da faixa: nenhum alvo", () => {
    const linhas = linhasBase();
    const alvo = calcularAlvo({
      linhas,
      y: ALTURA_ARVORE_BASE + 10,
      item: itemArquivo("A.md"),
      modo: "alphabetical",
      alturaArvore: ALTURA_ARVORE_BASE,
      alturaFaixaRaiz: 32,
    });
    expect(alvo).toBeNull();
  });

  it("item na raiz já é a última entrada, custom, dentro da faixa: sem efeito (já está no fim)", () => {
    const linhas = linhasBase();
    const alvo = calcularAlvo({
      linhas,
      y: ALTURA_ARVORE_BASE + 10,
      item: itemArquivo("C.md"), // já é a última linha da raiz
      modo: "custom",
      alturaArvore: ALTURA_ARVORE_BASE,
      alturaFaixaRaiz: 32,
    });
    expect(alvo).toBeNull();
  });
});

describe("calcularAlvo — abaixo da última linha, fora da faixa", () => {
  it("custom, item na raiz (pasta, sem faixa): reordenar no fim da raiz", () => {
    const linhas = montarLinhas([no("A.md"), no("PastaZ", true)]);
    const alvo = calcularAlvo({
      linhas,
      y: 52 + 5, // abaixo da árvore [52], alturaFaixaRaiz 0 (arrasto de pasta não desenha faixa)
      item: itemPasta("PastaZ") /* já é a última? não, é — mudemos pra A.md abaixo */,
      modo: "custom",
      alturaArvore: 52,
      alturaFaixaRaiz: 0,
    });
    // PastaZ já é a última linha da raiz: soltar no fim é sem efeito.
    expect(alvo).toBeNull();
  });

  it("custom, item na raiz (arquivo que não é o último), fora da faixa: reordenar no fim", () => {
    const linhas = montarLinhas([no("A.md"), no("PastaZ", true)]);
    const alvo = calcularAlvo({
      linhas,
      y: 52 + 5,
      item: itemArquivo("A.md"),
      modo: "custom",
      alturaArvore: 52,
      alturaFaixaRaiz: 0,
    });
    expect(alvo).toEqual({ tipo: "reordenar", pasta: "", antesDe: null, y: 52, nivel: 0 });
  });

  it("nunca produz 'mover' pra pasta arrastada, mesmo se alturaFaixaRaiz > 0 por engano", () => {
    const linhas = montarLinhas([no("Projetos", true), no("Projetos/Sub", true)]);
    const alvo = calcularAlvo({
      linhas,
      y: 26 + 10, // dentro da "faixa" indevida
      item: itemPasta("Projetos/Sub"), // pasta fora da raiz
      modo: "custom",
      alturaArvore: 26,
      alturaFaixaRaiz: 32,
    });
    expect(alvo).toBeNull();
  });

  it("pasta na raiz, custom, alturaFaixaRaiz > 0 por engano: reordena, nunca move", () => {
    const linhas = montarLinhas([no("PastaA", true), no("PastaB", true)]);
    const alvo = calcularAlvo({
      linhas,
      y: 52 + 5,
      item: itemPasta("PastaA"),
      modo: "custom",
      alturaArvore: 52,
      alturaFaixaRaiz: 32,
    });
    expect(alvo).toEqual({ tipo: "reordenar", pasta: "", antesDe: null, y: 52, nivel: 0 });
  });
});

describe("calcularAlvo — no-op: sem efeito = sem indicador", () => {
  it("antes de si mesmo (reinserir na mesma posição): nenhum alvo", () => {
    const linhas = linhasBase();
    // B.md já está logo antes de sep-001: soltar na metade de cima de sep-001 recolocaria
    // B.md exatamente onde já está.
    const alvo = calcularAlvo({
      linhas,
      y: 78 + 3,
      item: itemArquivo("B.md"),
      modo: "custom",
      alturaArvore: ALTURA_ARVORE_BASE,
      alturaFaixaRaiz: 32,
    });
    expect(alvo).toBeNull();
  });

  it("depois do vizinho de cima (já está logo depois dele): nenhum alvo", () => {
    const linhas = linhasBase();
    // C.md já vem logo depois de sep-001: soltar na metade de baixo de sep-001 é sem efeito.
    const alvo = calcularAlvo({
      linhas,
      y: 78 + 13,
      item: itemArquivo("C.md"),
      modo: "custom",
      alturaArvore: ALTURA_ARVORE_BASE,
      alturaFaixaRaiz: 32,
    });
    expect(alvo).toBeNull();
  });
});

describe("calcularAlvo — separador sobre linha filha de pasta aberta da raiz usa o bloco da pasta", () => {
  it("hover dentro de Projetos/A.md (filha) resolve pro bloco de Projetos", () => {
    const linhas = montarLinhas([
      no("Projetos", true),
      no("Projetos/A.md"),
      no("Projetos/B.md"),
      no("Zebra.md"),
    ]);
    const alturaArvore = 26 * 4;
    // Bloco de Projetos vai de 0 até 78 (início de Zebra.md). Hover em y=13 (dentro de
    // Projetos/A.md, [26-52]) cai no primeiro terço do bloco (13/78 < 0.5): antes de Projetos.
    const alvo = calcularAlvo({
      linhas,
      y: 13,
      item: itemSeparador("sep-novo"),
      modo: "custom",
      alturaArvore,
      alturaFaixaRaiz: 0,
    });
    expect(alvo).toEqual({ tipo: "reordenar", pasta: "", antesDe: "Projetos", y: 0, nivel: 0 });
  });

  it("hover na metade de baixo do bloco de Projetos (ainda dentro de A.md): depois de Projetos", () => {
    const linhas = montarLinhas([
      no("Projetos", true),
      no("Projetos/A.md"),
      no("Projetos/B.md"),
      no("Zebra.md"),
    ]);
    const alturaArvore = 26 * 4;
    // Bloco de Projetos: [0, 78). Metade é y=39. Escolhe y=45 (dentro de Projetos/B.md
    // [52-78)) pra garantir metade de baixo mesmo com folga de arredondamento.
    const alvo = calcularAlvo({
      linhas,
      y: 60,
      item: itemSeparador("sep-novo"),
      modo: "custom",
      alturaArvore,
      alturaFaixaRaiz: 0,
    });
    expect(alvo).toEqual({ tipo: "reordenar", pasta: "", antesDe: "Zebra.md", y: 78, nivel: 0 });
  });
});

describe("calcularAlvo — arrastando separador: abaixo da última linha", () => {
  it("no fim da raiz", () => {
    const linhas = linhasBase();
    const alvo = calcularAlvo({
      linhas,
      y: ALTURA_ARVORE_BASE + 5,
      item: itemSeparador("sep-novo"),
      modo: "custom",
      alturaArvore: ALTURA_ARVORE_BASE,
      alturaFaixaRaiz: 0,
    });
    expect(alvo).toEqual({ tipo: "reordenar", pasta: "", antesDe: null, y: ALTURA_ARVORE_BASE, nivel: 0 });
  });

  it("soltar sobre si mesmo: nenhum alvo", () => {
    const linhas = linhasBase();
    const alvo = calcularAlvo({
      linhas,
      y: 78 + 3, // dentro de sep-001, metade de cima -> "antes de si mesmo"
      item: itemSeparador("sep-001"),
      modo: "custom",
      alturaArvore: ALTURA_ARVORE_BASE,
      alturaFaixaRaiz: 0,
    });
    expect(alvo).toBeNull();
  });
});
