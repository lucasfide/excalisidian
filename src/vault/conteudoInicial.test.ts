import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const arquivos = new Map<string, string>();
const adapter = {
  existe: vi.fn(async (p: string) => arquivos.has(p)),
  lerTexto: vi.fn(async (p: string) => arquivos.get(p) ?? ""),
  escreverTexto: vi.fn(async (p: string, t: string) => void arquivos.set(p, t)),
};
const vaultState = {
  adapter,
  recarregarArvore: vi.fn(async () => {}),
  reindexarArquivo: vi.fn(async () => {}),
};
vi.mock("../estado/vaultStore", () => ({
  useVaultStore: { getState: () => vaultState },
}));

import {
  NOME_NOTA_BOAS_VINDAS,
  NOME_DESENHO_EXEMPLO,
  textoNotaBoasVindas,
  textoDesenhoExemplo,
  criarConteudoInicial,
} from "./conteudoInicial";
import { ehDesenho, parseDesenho, serializarDesenho } from "../canvas/formatoDesenho";
import type { PaletaCanvas } from "../canvas/paletaCanvas";

const PALETA: PaletaCanvas = { grade: "rgb(220, 213, 200)", traco: "rgb(28, 25, 23)" };

beforeEach(() => {
  arquivos.clear();
  adapter.existe.mockClear();
  adapter.lerTexto.mockClear();
  adapter.escreverTexto.mockClear();
  vaultState.recarregarArvore.mockClear();
  vaultState.reindexarArquivo.mockClear();
});

describe("textoNotaBoasVindas", () => {
  it("tem H1 'Boas-vindas', o link e o embed do desenho de exemplo", () => {
    const texto = textoNotaBoasVindas();
    expect(texto.startsWith(`# ${NOME_NOTA_BOAS_VINDAS}\n`)).toBe(true);
    expect(texto).toContain(`[[${NOME_DESENHO_EXEMPLO}.draw]]`);
    expect(texto).toContain(`![[${NOME_DESENHO_EXEMPLO}.draw]]`);
  });

  it("menciona busca, paleta de comandos e tarefas", () => {
    const texto = textoNotaBoasVindas();
    expect(texto).toContain("Ctrl+O");
    expect(texto).toContain("Ctrl+P");
    expect(texto).toContain("Ctrl+\\");
    expect(texto).toContain("- [ ] ");
  });

  it("é pura: duas chamadas produzem o mesmo texto", () => {
    expect(textoNotaBoasVindas()).toBe(textoNotaBoasVindas());
  });
});

describe("textoDesenhoExemplo", () => {
  it("produz um .draw.md válido", () => {
    const md = textoDesenhoExemplo(PALETA);
    expect(ehDesenho(md)).toBe(true);
  });

  it("tem 'Ideia', 'Nota' e 'Desenhe à vontade' nos Text Elements", () => {
    const dados = parseDesenho(textoDesenhoExemplo(PALETA));
    const textos = [...dados.textElements.values()];
    expect(textos).toContain("Ideia");
    expect(textos).toContain("Nota");
    expect(textos).toContain("Desenhe à vontade");
    expect(dados.cenaInvalida).toBeUndefined();
    expect(dados.cena.elements.length).toBeGreaterThan(0);
  });

  it("round-trip: serializarDesenho(parseDesenho(x)) é estável", () => {
    const x = textoDesenhoExemplo(PALETA);
    const volta = serializarDesenho(parseDesenho(x));
    expect(volta).toBe(x);
  });

  it("é pura: duas chamadas com a mesma paleta produzem o mesmo texto (sem Math.random)", () => {
    expect(textoDesenhoExemplo(PALETA)).toBe(textoDesenhoExemplo(PALETA));
  });
});

describe("criarConteudoInicial", () => {
  it("grava a nota e o desenho na raiz e devolve o caminho da nota", async () => {
    const caminho = await criarConteudoInicial();

    expect(caminho).toBe(`${NOME_NOTA_BOAS_VINDAS}.md`);
    expect(arquivos.has(`${NOME_DESENHO_EXEMPLO}.draw.md`)).toBe(true);
    expect(arquivos.has(`${NOME_NOTA_BOAS_VINDAS}.md`)).toBe(true);
    expect(ehDesenho(arquivos.get(`${NOME_DESENHO_EXEMPLO}.draw.md`)!)).toBe(true);
    expect(vaultState.recarregarArvore).toHaveBeenCalledTimes(1);
    expect(vaultState.reindexarArquivo).toHaveBeenCalledWith(`${NOME_DESENHO_EXEMPLO}.draw.md`);
    expect(vaultState.reindexarArquivo).toHaveBeenCalledWith(`${NOME_NOTA_BOAS_VINDAS}.md`);
  });

  it("colisão no nome do desenho: a nota aponta para o nome real", async () => {
    // Já existe um "Primeiro desenho.draw.md" na raiz — caminhoLivre pula para "(2)".
    arquivos.set(`${NOME_DESENHO_EXEMPLO}.draw.md`, "conteúdo antigo");

    await criarConteudoInicial();

    const nota = arquivos.get(`${NOME_NOTA_BOAS_VINDAS}.md`)!;
    expect(nota).toContain(`[[${NOME_DESENHO_EXEMPLO} (2).draw]]`);
    expect(nota).toContain(`![[${NOME_DESENHO_EXEMPLO} (2).draw]]`);
    expect(nota).not.toContain(`[[${NOME_DESENHO_EXEMPLO}.draw]]`);
    expect(arquivos.has(`${NOME_DESENHO_EXEMPLO} (2).draw.md`)).toBe(true);
  });
});

describe("sem hex literal no fonte (CLAUDE.md: cor só de paletaCanvas)", () => {
  it("conteudoInicial.ts não tem nenhum '#RRGGBB' nem '#RGB'", () => {
    const caminho = fileURLToPath(new URL("./conteudoInicial.ts", import.meta.url));
    const fonte = readFileSync(caminho, "utf8");
    expect(fonte).not.toMatch(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/);
  });
});
