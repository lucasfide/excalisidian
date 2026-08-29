import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

// Estado falho do vault, compartilhado entre os mocks e o corpo do teste (vi.mock é
// hoisted, então o objeto precisa ser criado com vi.hoisted para existir a tempo).
const { disco, vaultState } = vi.hoisted(() => {
  const disco = new Map<string, string>();
  const backlinksFake = new Map<string, unknown[]>();
  const vaultState = {
    adapter: {
      async lerTexto(p: string) {
        if (!disco.has(p)) throw new Error("ENOENT");
        return disco.get(p)!;
      },
      async escreverTexto(p: string, c: string) {
        disco.set(p, c);
      },
      async existe(p: string) {
        return disco.has(p);
      },
      async mover(de: string, para: string) {
        disco.set(para, disco.get(de)!);
        disco.delete(de);
      },
      absoluto: (p: string) => p,
    },
    links: { backlinks: backlinksFake },
    resolver: (_alvo: string, _origem: string): string | null => null,
    recarregarArvore: async () => {},
    reindexar: async () => {},
  };
  return { disco, vaultState };
});

vi.mock("../estado/vaultStore", () => ({
  useVaultStore: { getState: () => vaultState },
}));
vi.mock("../estado/documentosStore", () => ({
  useDocumentosStore: {
    getState: () => ({ flushTudo: async () => {}, recarregarDoDisco: async () => {} }),
  },
}));
vi.mock("../estado/workspaceStore", () => ({
  useWorkspaceStore: { getState: () => ({ renomearDocumento: () => {} }) },
}));

import { atualizarLinksNoTexto, renomearArquivo } from "./renomear";
import { construirIndiceResolucao, resolverLink } from "../indice/resolucao";
import {
  parseDesenho,
  serializarDesenho,
  blockIdsDaCena,
} from "../canvas/formatoDesenho";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

describe("atualizarLinksNoTexto (rename em lote — roadmap teste 4)", () => {
  it("troca só o alvo, preservando alias e subcaminho, e mantém estilo de caminho", () => {
    const idx = construirIndiceResolucao([
      "Projetos/Arquitetura.md",
      "Notas/Diario.md",
    ]);
    const resolver = (alvo: string) => resolverLink(idx, alvo, "Notas/Diario.md");
    const texto = [
      "Ver [[Arquitetura]] e [[Arquitetura#Backend|o backend]].",
      "Caminho completo: [[Projetos/Arquitetura]].",
      "Não é link: Arquitetura solta.",
      "Outro alvo: [[Diario]].",
    ].join("\n");

    const novoBase = "Sistema";
    const novoPath = "Projetos/Sistema";
    const [saida, n] = atualizarLinksNoTexto(
      texto,
      resolver,
      "Projetos/Arquitetura.md",
      (escrito) => (escrito.includes("/") ? novoPath : novoBase),
    );

    expect(n).toBe(3);
    expect(saida).toContain("[[Sistema]]");
    expect(saida).toContain("[[Sistema#Backend|o backend]]");
    expect(saida).toContain("[[Projetos/Sistema]]");
    expect(saida).toContain("Arquitetura solta"); // texto normal não muda
    expect(saida).toContain("[[Diario]]"); // outro alvo não muda
  });

  it("não mexe em nada quando nenhum link aponta para o arquivo renomeado", () => {
    const idx = construirIndiceResolucao(["A.md", "B.md"]);
    const [saida, n] = atualizarLinksNoTexto(
      "Só [[B]] aqui.",
      (alvo) => resolverLink(idx, alvo, "A.md"),
      "Z.md",
      () => "X",
    );
    expect(n).toBe(0);
    expect(saida).toBe("Só [[B]] aqui.");
  });
});

function elemento(over: Record<string, unknown>): ExcalidrawElement {
  return {
    version: 1,
    versionNonce: 0,
    updated: 0,
    seed: 1,
    x: 10,
    y: 20,
    width: 90,
    height: 60,
    ...over,
  } as unknown as ExcalidrawElement;
}

describe("renomearArquivo — atualiza links dentro de .draw.md sem tocar a cena", () => {
  beforeEach(() => {
    disco.clear();
    vaultState.links.backlinks.clear();
    vaultState.resolver = () => null;
  });

  it("reescreve o texto do elemento e o element.link, preservando a geometria", async () => {
    const idx = construirIndiceResolucao(["Arquitetura.md", "Diagrama.draw.md"]);
    vaultState.resolver = (alvo, origem) => resolverLink(idx, alvo, origem);
    vaultState.links.backlinks.set("Arquitetura.md", [
      { origem: "Diagrama.draw.md", line: 1, contexto: "", embed: false },
    ]);

    const elements = [
      elemento({ id: "tx1", type: "text", text: "Ver [[Arquitetura]] aqui." }),
      elemento({ id: "rc1", type: "rectangle", link: "[[Arquitetura]]" }),
    ];
    const idPorEl = blockIdsDaCena(elements);
    const original = serializarDesenho({
      frontmatter: { excalisidian: "drawing" },
      verso: "",
      textElements: new Map([[idPorEl.get("tx1")!, "Ver [[Arquitetura]] aqui."]]),
      elementLinks: new Map([["rc1", "[[Arquitetura]]"]]),
      embeddedFiles: new Map(),
      cena: { elements, appState: {} },
    });
    disco.set("Diagrama.draw.md", original);
    disco.set("Arquitetura.md", "# Arquitetura\n");

    const r = await renomearArquivo("Arquitetura.md", "Sistema");

    expect(r.ok).toBe(true);
    expect(r.linksAtualizados).toBe(2);

    const depois = parseDesenho(disco.get("Diagrama.draw.md")!);
    // ## Text Elements e ## Element Links refletem a cena viva, já atualizados.
    expect([...depois.textElements.values()]).toEqual(["Ver [[Sistema]] aqui."]);
    expect(depois.elementLinks.get("rc1")).toBe("[[Sistema]]");

    // A cena tem os dois elementos com o texto/link novo, e a geometria (x/y/width/height/
    // seed), a ordem e o id de cada um seguem intactos — só o campo que mudou, mudou.
    const antes = parseDesenho(original);
    expect(depois.cena.elements).toHaveLength(antes.cena.elements.length);
    const [txAntes, rcAntes] = antes.cena.elements;
    const [txDepois, rcDepois] = depois.cena.elements;
    expect(txDepois).toMatchObject({
      id: txAntes.id,
      x: txAntes.x,
      y: txAntes.y,
      width: txAntes.width,
      height: txAntes.height,
      seed: (txAntes as unknown as { seed: number }).seed,
      text: "Ver [[Sistema]] aqui.",
    });
    expect(rcDepois).toMatchObject({
      id: rcAntes.id,
      x: rcAntes.x,
      y: rcAntes.y,
      width: rcAntes.width,
      height: rcAntes.height,
      link: "[[Sistema]]",
    });
  });

  it("não produz um .draw.md diferente quando nenhum link do desenho aponta para o arquivo renomeado", async () => {
    const idx = construirIndiceResolucao(["Outra.md", "Diagrama.draw.md"]);
    vaultState.resolver = (alvo, origem) => resolverLink(idx, alvo, origem);
    vaultState.links.backlinks.set("Zeta.md", [
      { origem: "Diagrama.draw.md", line: 1, contexto: "", embed: false },
    ]);

    const original = serializarDesenho({
      frontmatter: {},
      verso: "",
      textElements: new Map(),
      elementLinks: new Map(),
      embeddedFiles: new Map(),
      cena: { elements: [], appState: {} },
    });
    disco.set("Diagrama.draw.md", original);
    disco.set("Zeta.md", "# Zeta\n");

    await renomearArquivo("Zeta.md", "Zeta2");

    // backlinks aponta Diagrama.draw.md como origem de Zeta.md, mas o vault.resolver não
    // resolve nenhum wikilink para Zeta.md dentro dele (cena vazia) — nada deve mudar.
    expect(disco.get("Diagrama.draw.md")).toBe(original);
  });
});
