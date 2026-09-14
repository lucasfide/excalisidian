import { describe, it, expect, afterEach, vi } from "vitest";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import {
  parseDesenho,
  serializarDesenho,
  blockIdsDaCena,
  desenhoVazio,
  type DadosDesenho,
} from "./formatoDesenho";

function el(over: Record<string, unknown>): ExcalidrawElement {
  return {
    version: 1,
    versionNonce: 0,
    updated: 0,
    seed: 12345,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    ...over,
  } as unknown as ExcalidrawElement;
}

// Cena com texto, imagem, link e post-it (retângulo + texto vinculado).
function cenaCompleta(): DadosDesenho {
  const elements = [
    el({ id: "rect_A1", type: "rectangle" }),
    el({ id: "txt_B2", type: "text", text: "olá mundo", containerId: null }),
    el({ id: "img_C3", type: "image", fileId: "file-abc" }),
    el({ id: "postit_D4", type: "rectangle", backgroundColor: "#EDDCB4" }),
    el({ id: "postxt_E5", type: "text", text: "lembrete", containerId: "postit_D4" }),
  ];
  const idPorEl = blockIdsDaCena(elements);
  return {
    frontmatter: { excalisidian: "drawing" },
    verso: "",
    textElements: new Map([
      [idPorEl.get("txt_B2")!, "olá mundo"],
      [idPorEl.get("postxt_E5")!, "lembrete"],
    ]),
    elementLinks: new Map([["rect_A1", "[[Projetos/Backend]]"]]),
    embeddedFiles: new Map([["file-abc", "[[anexos/diagrama.png]]"]]),
    cena: { elements, appState: {} },
  };
}

describe("formatoDesenho — .draw.md (doc 05 §10)", () => {
  it("teste 1: parseDesenho(serializarDesenho(x)) é igual a x", () => {
    const x = cenaCompleta();
    const volta = parseDesenho(serializarDesenho(x));
    expect(volta).toEqual(x);
  });

  it("teste 2: serializar a mesma cena duas vezes produz bytes idênticos", () => {
    const x = cenaCompleta();
    const a = serializarDesenho(x);
    const b = serializarDesenho(parseDesenho(a));
    expect(a).toBe(b);
    expect(serializarDesenho(x)).toBe(a);
  });

  it("teste 8: blockId é estável entre chamadas e nunca contém '_'", () => {
    const elements = [
      el({ id: "abcdefghij_1", type: "text", text: "a" }),
      el({ id: "abcdefghij_2", type: "text", text: "b" }),
      el({ id: "xy_zw", type: "rectangle" }),
    ];
    const m1 = blockIdsDaCena(elements);
    const m2 = blockIdsDaCena(elements);
    expect([...m1.entries()]).toEqual([...m2.entries()]);
    for (const bid of m1.values()) {
      expect(bid).not.toContain("_");
      expect(bid).toMatch(/^[a-z]{2}-[A-Za-z0-9-]+$/);
    }
    // Colisão determinística: os dois primeiros sanitizam para o mesmo base.
    expect(m1.get("abcdefghij_1")).toBe("tx-abcdefghij");
    expect(m1.get("abcdefghij_2")).toBe("tx-abcdefghij-2");
  });

  it("teste 9: texto de canvas com %%, crases, ## Scene, linha com ^ e linha em branco sobrevive ao ciclo", () => {
    const texto = [
      "linha com %% no meio",
      "```",
      "## Scene não é heading aqui",
      "",
      "^isto não é block id",
      "fim",
    ].join("\n");

    const elements = [el({ id: "t_1", type: "text", text: texto })];
    const bid = blockIdsDaCena(elements).get("t_1")!;
    const x: DadosDesenho = {
      frontmatter: { excalisidian: "drawing" },
      verso: "",
      textElements: new Map([[bid, texto]]),
      elementLinks: new Map(),
      embeddedFiles: new Map(),
      cena: { elements, appState: {} },
    };

    const volta = parseDesenho(serializarDesenho(x));
    expect(volta.textElements.get(bid)).toBe(texto);
  });

  // Guarda de regressão: parseDesenho crashava todo .draw.md no WebView2 porque o
  // gray-matter chamava Buffer.from() na entrada, e Buffer não existe no navegador. O
  // ambiente "node" do vitest tem Buffer de graça e escondeu isso — este teste apaga o
  // global de propósito para o vitest também sentir a falta dele.
  describe("sem Buffer global (o que o WebView2 realmente tem)", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("parseDesenho não lança quando Buffer não existe", () => {
      vi.stubGlobal("Buffer", undefined);
      expect(() => parseDesenho(desenhoVazio())).not.toThrow();
    });

    it("parseDesenho lê o frontmatter normalmente sem Buffer", () => {
      vi.stubGlobal("Buffer", undefined);
      const md = "---\nexcalisidian: drawing\naliases: [X]\n---\n%%\n# Excalisidian Drawing\n%%\n";
      expect(parseDesenho(md).frontmatter.aliases).toEqual(["X"]);
    });
  });

  // Regressões da auditoria de 12/09/2026, achados 07 e 08.
  describe("auditoria 12/09 — frontmatter e cena quebrada", () => {
    it("achado 07: frontmatter com valores difíceis sobrevive ao round-trip byte a byte", () => {
      const x = cenaCompleta();
      x.frontmatter.descricao = "a: b";
      x.frontmatter.detalhes = { autor: "Ana", notas: ["x, y", "z"] };
      x.frontmatter.atualizado = true;
      x.frontmatter.ordem = 3;
      x.frontmatter.notaNula = null;
      x.frontmatter.listaComCrase = "tem ``` dentro";

      const serializado = serializarDesenho(x);
      const volta = parseDesenho(serializado);

      expect(volta.frontmatter.descricao).toBe("a: b");
      expect(volta.frontmatter.detalhes).toEqual({ autor: "Ana", notas: ["x, y", "z"] });
      expect(volta.frontmatter.atualizado).toBe(true);
      expect(volta.frontmatter.ordem).toBe(3);
      expect(volta.frontmatter.notaNula).toBeNull();
      expect(volta.frontmatter.listaComCrase).toBe("tem ``` dentro");
      // bytes estáveis entre gravações (RNF7): reabrir e salvar não gera diff
      expect(serializarDesenho(volta)).toBe(serializado);
    });

    it("achado 08: cena ilegível marca cenaInvalida e o round-trip preserva o arquivo", () => {
      const bom = serializarDesenho(cenaCompleta());
      const quebrado = bom.replace(
        /```draw-json\n[\s\S]*?\n```/,
        "```draw-json\n{ JSON INVALIDO }\n```",
      );

      const dados = parseDesenho(quebrado);

      expect(dados.cenaInvalida).toBe(true);
      expect(dados.cena.elements).toEqual([]);
      // o serialize não destrói o que talvez seja recuperável à mão
      expect(serializarDesenho(dados)).toBe(quebrado);
    });

    it("achado 08: fence não reconhecido e elements ausente também contam como corrupção", () => {
      const semFence = serializarDesenho(cenaCompleta()).replace(
        /```draw-json\n[\s\S]*?\n```/,
        "```json\n{\"elements\":[]}\n```",
      );
      expect(parseDesenho(semFence).cenaInvalida).toBe(true);

      const semElements = serializarDesenho(cenaCompleta()).replace(
        /```draw-json\n[\s\S]*?\n```/,
        '```draw-json\n{"appState":{}}\n```',
      );
      expect(parseDesenho(semElements).cenaInvalida).toBe(true);
    });

    it("desenho vazio de verdade não é confundido com cena quebrada", () => {
      const vazio = parseDesenho(desenhoVazio());
      expect(vazio.cenaInvalida).toBeUndefined();
      expect(vazio.cena.elements).toEqual([]);
    });
  });
});
