// src/vault/ordenacao.test.ts
import { describe, it, expect } from "vitest";

import { montarArvore } from "./arvore";
import type { EntradaArquivo } from "./VaultAdapter";
import {
  ORDEM_MODOS,
  ROTULO_MODO,
  ordenarArvore,
  listaPorData,
} from "./ordenacao";

function ent(path: string, isDir = false): EntradaArquivo {
  return { path, isDir, size: 0, mtimeMs: 0, birthtimeMs: 0 };
}

describe("ORDEM_MODOS / ROTULO_MODO", () => {
  it("tem os 4 modos na ordem do dropdown, cada um com rótulo", () => {
    expect(ORDEM_MODOS).toEqual(["custom", "alphabetical", "dateDesc", "dateAsc"]);
    for (const modo of ORDEM_MODOS) expect(ROTULO_MODO[modo]).toBeTruthy();
  });
});

describe("ordenarArvore — alphabetical", () => {
  it("é a mesma ordem que montarArvore já produz (pastas primeiro, alfabético)", () => {
    const raiz = montarArvore([
      ent("Zebra.md"),
      ent("Projetos", true),
      ent("Ana.md"),
    ]);
    const ordenada = ordenarArvore(raiz, "alphabetical", {});
    expect(ordenada.filhos.map((n) => n.nome)).toEqual(["Projetos", "Ana.md", "Zebra.md"]);
  });
});

describe("ordenarArvore — custom", () => {
  it("segue a ordem do customOrder quando todos os itens estão listados", () => {
    const raiz = montarArvore([ent("A.md"), ent("B.md"), ent("C.md")]);
    const ordenada = ordenarArvore(raiz, "custom", { "": ["C.md", "A.md", "B.md"] });
    expect(ordenada.filhos.map((n) => n.nome)).toEqual(["C.md", "A.md", "B.md"]);
  });

  it("ignora separadores (sep-xxxxxx) — eles não são NoArvore", () => {
    const raiz = montarArvore([ent("A.md"), ent("B.md")]);
    const ordenada = ordenarArvore(raiz, "custom", { "": ["B.md", "sep-a1b2c3", "A.md"] });
    expect(ordenada.filhos.map((n) => n.nome)).toEqual(["B.md", "A.md"]);
  });

  it("item ausente do customOrder entra no fim, em ordem alfabética", () => {
    const raiz = montarArvore([ent("A.md"), ent("B.md"), ent("Novo.md")]);
    const ordenada = ordenarArvore(raiz, "custom", { "": ["B.md", "A.md"] });
    expect(ordenada.filhos.map((n) => n.nome)).toEqual(["B.md", "A.md", "Novo.md"]);
  });

  it("customOrder vazio equivale a alfabética", () => {
    const raiz = montarArvore([ent("Zebra.md"), ent("Ana.md")]);
    const ordenada = ordenarArvore(raiz, "custom", {});
    expect(ordenada.filhos.map((n) => n.nome)).toEqual(["Ana.md", "Zebra.md"]);
  });

  it("ordena cada nível recursivamente, com a ordem daquela pasta", () => {
    const raiz = montarArvore([
      ent("Projetos", true),
      ent("Projetos/Z.md"),
      ent("Projetos/A.md"),
    ]);
    const ordenada = ordenarArvore(raiz, "custom", {
      Projetos: ["Z.md", "A.md"],
    });
    const projetos = ordenada.filhos.find((n) => n.nome === "Projetos")!;
    expect(projetos.filhos.map((n) => n.nome)).toEqual(["Z.md", "A.md"]);
  });
});

describe("listaPorData", () => {
  it("achata só notas e desenhos, ignora pastas e a pasta anexos, ordena por mtimeMs", () => {
    const raiz = montarArvore([
      ent("Projetos", true),
      ent("Projetos/Velha.md"),
      ent("Nova.draw.md"),
      ent("anexos", true),
      ent("anexos/foto.png"),
    ]);
    const meta = new Map([
      ["Projetos/Velha.md", { mtimeMs: 100 }],
      ["Nova.draw.md", { mtimeMs: 200 }],
    ]);
    const desc = listaPorData(raiz, "dateDesc", meta);
    expect(desc.map((i) => i.no.path)).toEqual(["Nova.draw.md", "Projetos/Velha.md"]);
    expect(desc[0].pastaExibicao).toBe("");
    expect(desc[1].pastaExibicao).toBe("Projetos");

    const asc = listaPorData(raiz, "dateAsc", meta);
    expect(asc.map((i) => i.no.path)).toEqual(["Projetos/Velha.md", "Nova.draw.md"]);
  });

  it("arquivo sem entrada no metaPorPath conta como mtimeMs 0", () => {
    const raiz = montarArvore([ent("SemMeta.md")]);
    const desc = listaPorData(raiz, "dateDesc", new Map());
    expect(desc.map((i) => i.no.path)).toEqual(["SemMeta.md"]);
    expect(desc[0].mtimeMs).toBe(0);
  });
});
