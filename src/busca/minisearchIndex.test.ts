// Busca por conteúdo (RF4.8): índice, consulta com frase/exclusão, trechos e persistência.
import { describe, it, expect, beforeEach, vi } from "vitest";

// plugin-store em memória (mesmo padrão de tarefasStore.test.ts).
const { storeMem } = vi.hoisted(() => ({
  storeMem: new Map<string, Map<string, unknown>>(),
}));
vi.mock("@tauri-apps/plugin-store", () => ({
  load: async (nome: string) => {
    if (!storeMem.has(nome)) storeMem.set(nome, new Map());
    const mem = storeMem.get(nome)!;
    return {
      get: async (k: string) => mem.get(k),
      set: async (k: string, v: unknown) => void mem.set(k, v),
      save: async () => {},
    };
  },
}));

import {
  inicializarBusca,
  atualizarDocumentoBusca,
  removerDocumentoBusca,
  sincronizarBusca,
  buscarConteudo,
  parsearConsulta,
  textoParaBusca,
  montarTrechos,
  partesComDestaque,
  salvarBusca,
  contarDocumentosBusca,
} from "./minisearchIndex";
import {
  blockIdsDaCena,
  desenhoVazio,
  parseDesenho,
  serializarDesenho,
} from "../canvas/formatoDesenho";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

const RAIZ = "C:/vault";

// O serializador recalcula `## Text Elements` a partir da cena (doc 02 §3.1): os textos
// precisam existir como elementos de texto na cena, com blockId derivado do id.
function desenhoCom(textos: string[], verso = ""): string {
  const elements = textos.map(
    (t, i) =>
      ({
        version: 1,
        versionNonce: 0,
        updated: 0,
        seed: 1,
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        id: `txt${i}`,
        type: "text",
        text: t,
        containerId: null,
      }) as unknown as ExcalidrawElement,
  );
  const idPorEl = blockIdsDaCena(elements);
  const d = parseDesenho(desenhoVazio());
  // Contrato do serializador: verso não-vazio já vem do parse com "\n" final.
  d.verso = verso === "" ? "" : `${verso}\n`;
  d.textElements = new Map(textos.map((t, i) => [idPorEl.get(`txt${i}`)!, t]));
  d.cena = { elements, appState: {} };
  return serializarDesenho(d);
}

/** Disco falso: buscarConteudo relê os candidatos para montar os trechos. */
function leitor(disco: Map<string, string>) {
  return async (p: string) => {
    if (!disco.has(p)) throw new Error("ENOENT");
    return disco.get(p)!;
  };
}

beforeEach(async () => {
  storeMem.clear();
  await inicializarBusca(RAIZ);
});

describe("textoParaBusca", () => {
  it("nota: remove o frontmatter e mantém o corpo", () => {
    const texto = textoParaBusca(
      "Nota.md",
      "---\naliases: [x]\n---\n\n# Titulo\n\nCorpo da nota.\n",
    );
    expect(texto).not.toContain("aliases");
    expect(texto).toContain("Corpo da nota.");
  });

  it("desenho: inclui verso e textos de elementos, exclui o JSON da cena", () => {
    const md = desenhoCom(["Fluxo do orcamento", "[[Nota]]"], "Anotacoes do verso");
    const texto = textoParaBusca("D.draw.md", md);
    expect(texto).toContain("Fluxo do orcamento");
    expect(texto).toContain("Anotacoes do verso");
    expect(texto).not.toContain("draw-json");
    expect(texto).not.toContain("excalidraw");
  });
});

describe("parsearConsulta", () => {
  it("separa termos, frase exata e exclusão", () => {
    const c = parsearConsulta('orcamento "reuniao de segunda" -adiada');
    expect(c.frases).toEqual(["reuniao de segunda"]);
    expect(c.excluidos).toEqual(["adiada"]);
    expect(c.termos).toEqual(
      expect.arrayContaining(["orcamento", "reuniao", "de", "segunda"]),
    );
    expect(c.termos).not.toContain("-adiada");
  });

  it("aspas vazias e hífen solto não viram termo", () => {
    const c = parsearConsulta('" " - x');
    expect(c.frases).toEqual([]);
    expect(c.excluidos).toEqual([]);
    expect(c.termos).toEqual(["x"]);
  });
});

describe("buscarConteudo", () => {
  it("encontra pelo corpo, com número da linha do arquivo (frontmatter conta)", async () => {
    const disco = new Map([
      ["A.md", "---\naliases: []\n---\nIntro.\nO orcamento de 2026 esta aqui.\nFim.\n"],
      ["B.md", "Nada relacionado.\n"],
    ]);
    atualizarDocumentoBusca("A.md", disco.get("A.md")!, 1, 10);
    atualizarDocumentoBusca("B.md", disco.get("B.md")!, 1, 10);

    const resultados = await buscarConteudo("orcamento", leitor(disco));

    expect(resultados).toHaveLength(1);
    expect(resultados[0].path).toBe("A.md");
    expect(resultados[0].trechos[0].linha).toBe(5);
    expect(resultados[0].trechos[0].trecho).toContain("orcamento");
  });

  it("texto de desenho é pesquisável e o resultado vem identificado", async () => {
    const md = desenhoCom(["Fluxo do orcamento"]);
    const disco = new Map([["D.draw.md", md]]);
    atualizarDocumentoBusca("D.draw.md", md, 1, 10);

    const resultados = await buscarConteudo("orcamento", leitor(disco));

    expect(resultados).toHaveLength(1);
    expect(resultados[0].kind).toBe("drawing");
    expect(resultados[0].trechos[0].trecho).toContain("Fluxo do orcamento");
  });

  it('frase exata: "reuniao de segunda" só casa com a sequência contígua', async () => {
    const disco = new Map([
      ["A.md", "A reuniao de segunda foi cancelada.\n"],
      ["B.md", "A reuniao marcada para segunda.\n"],
    ]);
    atualizarDocumentoBusca("A.md", disco.get("A.md")!, 1, 10);
    atualizarDocumentoBusca("B.md", disco.get("B.md")!, 1, 10);

    const resultados = await buscarConteudo('"reuniao de segunda"', leitor(disco));

    expect(resultados.map((r) => r.path)).toEqual(["A.md"]);
  });

  it("-termo exclui o arquivo que o contém", async () => {
    const disco = new Map([
      ["A.md", "reuniao urgente\n"],
      ["B.md", "reuniao adiada\n"],
    ]);
    atualizarDocumentoBusca("A.md", disco.get("A.md")!, 1, 10);
    atualizarDocumentoBusca("B.md", disco.get("B.md")!, 1, 10);

    const resultados = await buscarConteudo("reuniao -adiada", leitor(disco));

    expect(resultados.map((r) => r.path)).toEqual(["A.md"]);
  });

  it("no máximo 3 trechos por arquivo (doc 04 §8)", async () => {
    const linhas = Array.from({ length: 10 }, (_, i) => `linha ${i} com orcamento`);
    const disco = new Map([["A.md", linhas.join("\n")]]);
    atualizarDocumentoBusca("A.md", disco.get("A.md")!, 1, 10);

    const resultados = await buscarConteudo("orcamento", leitor(disco));

    expect(resultados[0].trechos).toHaveLength(3);
    expect(resultados[0].trechos[0].linha).toBe(1);
  });

  it("consulta vazia ou só com exclusões não busca", async () => {
    atualizarDocumentoBusca("A.md", "orcamento", 1, 10);
    expect(await buscarConteudo("", leitor(new Map()))).toEqual([]);
    expect(await buscarConteudo("-x", leitor(new Map()))).toEqual([]);
  });

  it("arquivo removido do disco entre indexar e buscar não quebra a busca", async () => {
    atualizarDocumentoBusca("A.md", "orcamento", 1, 10);
    const resultados = await buscarConteudo("orcamento", leitor(new Map()));
    expect(resultados).toEqual([]);
  });
});

describe("busca sem acento, com prefixo e combinando termos (doc 13 §2.1)", () => {
  it("acento: 'reuniao' acha 'Reunião'", async () => {
    const disco = new Map([["A.md", "Pauta da reunião de hoje.\n"]]);
    atualizarDocumentoBusca("A.md", disco.get("A.md")!, 1, 10);

    const resultados = await buscarConteudo("reuniao", leitor(disco));

    expect(resultados.map((r) => r.path)).toEqual(["A.md"]);
  });

  it("prefixo: 'proj' acha 'Projeto'", async () => {
    const disco = new Map([["A.md", "Projeto novo começou hoje.\n"]]);
    atualizarDocumentoBusca("A.md", disco.get("A.md")!, 1, 10);

    const resultados = await buscarConteudo("proj", leitor(disco));

    expect(resultados.map((r) => r.path)).toEqual(["A.md"]);
  });

  it("padrão OR: um dos termos já basta (recuperacao.ts depende disto)", async () => {
    const disco = new Map([
      ["A.md", "so alfa aqui\n"],
      ["B.md", "so beta aqui\n"],
      ["C.md", "nem um nem outro\n"],
    ]);
    atualizarDocumentoBusca("A.md", disco.get("A.md")!, 1, 10);
    atualizarDocumentoBusca("B.md", disco.get("B.md")!, 1, 10);
    atualizarDocumentoBusca("C.md", disco.get("C.md")!, 1, 10);

    const resultados = await buscarConteudo("alfa beta", leitor(disco));

    expect(resultados.map((r) => r.path).sort()).toEqual(["A.md", "B.md"]);
  });

  it("combinar 'AND': só o arquivo com os dois termos", async () => {
    const disco = new Map([
      ["A.md", "so alfa aqui\n"],
      ["B.md", "alfa e beta juntos\n"],
    ]);
    atualizarDocumentoBusca("A.md", disco.get("A.md")!, 1, 10);
    atualizarDocumentoBusca("B.md", disco.get("B.md")!, 1, 10);

    const resultados = await buscarConteudo("alfa beta", leitor(disco), { combinar: "AND" });

    expect(resultados.map((r) => r.path)).toEqual(["B.md"]);
  });

  it("frase exata com acento: só casa a sequência contígua acentuada", async () => {
    const disco = new Map([
      ["A.md", "A reunião de segunda foi cancelada.\n"],
      ["B.md", "A reunião marcada para segunda.\n"],
    ]);
    atualizarDocumentoBusca("A.md", disco.get("A.md")!, 1, 10);
    atualizarDocumentoBusca("B.md", disco.get("B.md")!, 1, 10);

    const resultados = await buscarConteudo('"reuniao de segunda"', leitor(disco));

    expect(resultados.map((r) => r.path)).toEqual(["A.md"]);
  });

  it("exclusão com acento: '-adiada' exclui mesmo escrito sem acento na nota", async () => {
    const disco = new Map([
      ["A.md", "reunião urgente\n"],
      ["B.md", "reunião adiáda\n"],
    ]);
    atualizarDocumentoBusca("A.md", disco.get("A.md")!, 1, 10);
    atualizarDocumentoBusca("B.md", disco.get("B.md")!, 1, 10);

    const resultados = await buscarConteudo("reuniao -adiada", leitor(disco));

    expect(resultados.map((r) => r.path)).toEqual(["A.md"]);
  });
});

describe("manutenção do índice", () => {
  it("removerDocumentoBusca tira o arquivo dos resultados", async () => {
    const disco = new Map([["A.md", "orcamento secreto\n"]]);
    atualizarDocumentoBusca("A.md", disco.get("A.md")!, 1, 10);
    removerDocumentoBusca("A.md");

    expect(await buscarConteudo("orcamento", leitor(disco))).toEqual([]);
  });

  it("sincronizarBusca lê só o que mudou e remove o que sumiu", async () => {
    const disco = new Map([
      ["A.md", "alfa\n"],
      ["B.md", "beta\n"],
    ]);
    await sincronizarBusca(
      [
        { path: "A.md", isDir: false, mtimeMs: 1, size: 5 },
        { path: "B.md", isDir: false, mtimeMs: 1, size: 5 },
      ],
      leitor(disco),
    );
    expect(contarDocumentosBusca()).toBe(2);

    // Segunda passada: A inalterado (não relê), B mudou (relê).
    disco.set("B.md", "gama\n");
    const lidos: string[] = [];
    await sincronizarBusca(
      [
        { path: "A.md", isDir: false, mtimeMs: 1, size: 5 },
        { path: "B.md", isDir: false, mtimeMs: 2, size: 5 },
      ],
      async (p) => {
        lidos.push(p);
        return leitor(disco)(p);
      },
    );

    expect(lidos).toEqual(["B.md"]);
    expect(contarDocumentosBusca()).toBe(2);
    expect(await buscarConteudo("beta", leitor(disco))).toEqual([]);
    expect(await buscarConteudo("gama", leitor(disco))).toHaveLength(1);

    // Terceira passada: B sumiu do vault — sai do índice sem reler nada.
    await sincronizarBusca(
      [{ path: "A.md", isDir: false, mtimeMs: 1, size: 5 }],
      async (p) => {
        lidos.push(p);
        return leitor(disco)(p);
      },
    );
    expect(lidos).toEqual(["B.md"]);
    expect(contarDocumentosBusca()).toBe(1);
    expect(await buscarConteudo("gama", leitor(disco))).toEqual([]);
  });

  it("anexos ficam de fora do índice", async () => {
    await sincronizarBusca(
      [{ path: "foto.png", isDir: false, mtimeMs: 1, size: 5 }],
      async () => "binario",
    );
    expect(contarDocumentosBusca()).toBe(0);
  });

  it("persistência: salvar e reinicializar mantém a busca funcionando", async () => {
    const disco = new Map([["A.md", "orcamento persistido\n"]]);
    atualizarDocumentoBusca("A.md", disco.get("A.md")!, 1, 10);
    await salvarBusca();

    await inicializarBusca(RAIZ); // simula reabertura do app
    expect(contarDocumentosBusca()).toBe(1);

    const resultados = await buscarConteudo("orcamento", leitor(disco));
    expect(resultados.map((r) => r.path)).toEqual(["A.md"]);
  });
});

describe("montarTrechos e partesComDestaque", () => {
  it("montarTrechos devolve as primeiras linhas que contêm o termo", () => {
    const trechos = montarTrechos("um\norcamento aqui\noutro orcamento\nx\norcamento\norcamento", ["orcamento"], []);
    expect(trechos.map((t) => t.linha)).toEqual([2, 3, 5]);
  });

  it("linha longa é recortada em volta da ocorrência", () => {
    const linha = `${"x".repeat(200)} orcamento ${"y".repeat(200)}`;
    const [trecho] = montarTrechos(linha, ["orcamento"], []);
    expect(trecho.trecho.length).toBeLessThan(linha.length);
    expect(trecho.trecho).toContain("orcamento");
    expect(trecho.trecho.startsWith("…")).toBe(true);
  });

  it("partesComDestaque marca as ocorrências sem perder texto", () => {
    const partes = partesComDestaque("O Orcamento de 2026", ["orcamento"], []);
    expect(partes.map((p) => p.texto).join("")).toBe("O Orcamento de 2026");
    expect(partes.filter((p) => p.destaque).map((p) => p.texto)).toEqual(["Orcamento"]);
  });

  it("partesComDestaque acha pelo termo sem acento mas destaca o texto ORIGINAL com acento", () => {
    const partes = partesComDestaque("A Reunião de hoje", ["reuniao"], []);
    expect(partes.map((p) => p.texto).join("")).toBe("A Reunião de hoje");
    expect(partes.filter((p) => p.destaque).map((p) => p.texto)).toEqual(["Reunião"]);
  });

  it("linhaCompleta vem sem recorte nem reticências, mesmo em linha longa", () => {
    const linha = `${"x".repeat(200)} orcamento ${"y".repeat(200)}`;
    const [trecho] = montarTrechos(linha, ["orcamento"], []);
    expect(trecho.linhaCompleta).toBe(linha);
    expect(trecho.trecho.length).toBeLessThan(trecho.linhaCompleta.length);
  });
});
