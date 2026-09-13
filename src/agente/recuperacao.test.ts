// Doc 11 §12, item 6: recuperação local — vizinhos na frente, busca por termos depois,
// nunca a própria nota, teto de 5.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { buscarConteudoMock } = vi.hoisted(() => ({ buscarConteudoMock: vi.fn() }));
vi.mock("../busca/minisearchIndex", () => ({
  buscarConteudo: buscarConteudoMock,
}));

import { palavrasChave, recuperarNotasRelacionadas } from "./recuperacao";

beforeEach(() => buscarConteudoMock.mockReset());

const disco = new Map<string, string>([
  ["A.md", "conteúdo de A com bastante texto para o trecho"],
  ["B.md", "conteúdo de B"],
  ["atual.md", "a própria nota"],
]);

const lerTexto = async (p: string) => {
  if (!disco.has(p)) throw new Error("ENOENT");
  return disco.get(p)!;
};

describe("palavrasChave", () => {
  it("extrai as palavras mais frequentes, ignorando stopwords e palavras curtas", () => {
    const texto =
      "arquitetura arquitetura arquitetura banco banco dados a de da o em para";
    expect(palavrasChave(texto, 2)).toEqual(["arquitetura", "banco"]);
  });
});

describe("recuperarNotasRelacionadas", () => {
  it("vizinhos do grafo entram primeiro, com trecho; a própria nota fica de fora", async () => {
    buscarConteudoMock.mockResolvedValue([]);
    const r = await recuperarNotasRelacionadas({
      caminhoAtual: "atual.md",
      termos: [],
      lerTexto,
      vizinhos: ["A.md", "atual.md"],
      tituloDe: (p) => p.replace(".md", ""),
    });
    expect(r).toEqual([
      { path: "A.md", titulo: "A", trecho: "conteúdo de A com bastante texto para o trecho" },
    ]);
  });

  it("complementa com a busca por conteúdo até 5, sem duplicar vizinho", async () => {
    buscarConteudoMock.mockResolvedValue(
      ["A.md", "B.md", "C.md", "D.md", "E.md", "F.md"].map((path) => ({
        path,
        titulo: path,
        kind: "note",
        trechos: [{ linha: 1, trecho: "t" }],
      })),
    );
    const r = await recuperarNotasRelacionadas({
      caminhoAtual: "atual.md",
      termos: ["tema"],
      lerTexto,
      vizinhos: ["A.md"],
      tituloDe: (p) => p,
    });
    expect(r).toHaveLength(5);
    expect(r.map((x) => x.path)).toEqual(["A.md", "B.md", "C.md", "D.md", "E.md"]);
  });

  it("vizinho ilegível entra com trecho vazio em vez de derrubar a recuperação", async () => {
    buscarConteudoMock.mockResolvedValue([]);
    const r = await recuperarNotasRelacionadas({
      caminhoAtual: "atual.md",
      termos: [],
      lerTexto: async () => {
        throw new Error("EIO");
      },
      vizinhos: ["Sumiu.md"],
      tituloDe: () => "Sumiu",
    });
    expect(r[0]).toEqual({ path: "Sumiu.md", titulo: "Sumiu", trecho: "" });
  });
});
