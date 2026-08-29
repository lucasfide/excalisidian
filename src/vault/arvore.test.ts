import { describe, it, expect } from "vitest";

import { montarArvore, tipoDoArquivo, encontrarNo, nomeExibicao } from "./arvore";
import type { NoArvore } from "./arvore";
import type { EntradaArquivo } from "./VaultAdapter";

function ent(path: string, isDir = false): EntradaArquivo {
  return { path, isDir, size: 0, mtimeMs: 0, birthtimeMs: 0 };
}

describe("tipoDoArquivo", () => {
  it("distingue desenho, nota e anexo", () => {
    expect(tipoDoArquivo("Arquitetura.draw.md")).toBe("drawing");
    expect(tipoDoArquivo("Nota.md")).toBe("note");
    expect(tipoDoArquivo("imagem.png")).toBe("attachment");
  });
});

describe("montarArvore", () => {
  it("aninha arquivos dentro das pastas e cria pastas ausentes", () => {
    const raiz = montarArvore([
      ent("Projetos", true),
      ent("Projetos/Excalisidian.md"),
      ent("Projetos/Arquitetura.draw.md"),
      ent("Diário/2026-08-28.md"), // pasta "Diário" não veio como entrada
      ent("Bem-vindo.md"),
    ]);

    const nomesRaiz = raiz.filhos.map((n) => n.nome);
    // Pastas primeiro, depois arquivos, alfabético.
    expect(nomesRaiz).toEqual(["Diário", "Projetos", "Bem-vindo.md"]);

    const projetos = raiz.filhos.find((n) => n.nome === "Projetos")!;
    expect(projetos.tipo).toBe("folder");
    expect(projetos.filhos.map((n) => n.nome)).toEqual([
      "Arquitetura.draw.md",
      "Excalisidian.md",
    ]);

    const diario = raiz.filhos.find((n) => n.nome === "Diário")!;
    expect(diario.filhos.map((n) => n.path)).toEqual(["Diário/2026-08-28.md"]);
  });

  it("raiz vazia para vault sem arquivos", () => {
    expect(montarArvore([]).filhos).toEqual([]);
  });
});

describe("nomeExibicao", () => {
  function no(over: Partial<NoArvore>): NoArvore {
    return { path: "", nome: "", tipo: "note", filhos: [], ...over };
  }

  it("esconde .md de uma nota", () => {
    expect(nomeExibicao(no({ nome: "Fidelis.md", tipo: "note" }))).toBe("Fidelis");
  });

  it("esconde .draw.md inteiro de um desenho (o ícone já diz que é desenho)", () => {
    expect(nomeExibicao(no({ nome: "asd.draw.md", tipo: "drawing" }))).toBe("asd");
  });

  it("mantém a extensão de um anexo", () => {
    expect(nomeExibicao(no({ nome: "foto.png", tipo: "attachment" }))).toBe("foto.png");
  });

  it("mantém o nome de uma pasta como está", () => {
    expect(nomeExibicao(no({ nome: "Projetos", tipo: "folder" }))).toBe("Projetos");
  });
});

describe("encontrarNo", () => {
  const raiz = montarArvore([
    ent("Projetos", true),
    ent("Projetos/Sub", true),
    ent("Projetos/Sub/Fundo.md"),
    ent("Bem-vindo.md"),
  ]);

  it("acha a raiz pelo path vazio", () => {
    expect(encontrarNo(raiz, "")).toBe(raiz);
  });

  it("acha uma pasta de primeiro nível e um arquivo aninhado", () => {
    expect(encontrarNo(raiz, "Projetos")?.tipo).toBe("folder");
    expect(encontrarNo(raiz, "Projetos/Sub/Fundo.md")?.nome).toBe("Fundo.md");
  });

  it("devolve null para um caminho que não existe", () => {
    expect(encontrarNo(raiz, "Não/Existe")).toBe(null);
  });
});
