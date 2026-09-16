// Testes de seleção vazia dos comandos de formatação (doc 14 §1.2, doc 04 §3.4): a barra de
// formatação flutuante passa a agir sem seleção, então cada comando precisa fazer a coisa certa
// nesse caso. Sem DOM no ambiente de teste (vitest roda em "node") — em vez de um `EditorView`
// de verdade, uma vista falsa que só implementa o pedaço de API que os comandos usam
// (`state` + `dispatch`), igual sugerido no doc 14 §2.5.

import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

import {
  alternarHeading,
  alternarListaNumerada,
  alternarPrefixoLinha,
  envolver,
  inserirLink,
} from "./comandosMarkdown";

/** Vista falsa: guarda o estado à parte e aplica `dispatch` nele, sem nenhuma peça de DOM. */
function criarViewFalsa(doc: string, cursor: number): EditorView {
  let state = EditorState.create({ doc, selection: EditorSelection.cursor(cursor) });
  return {
    get state() {
      return state;
    },
    dispatch(spec: Parameters<EditorState["update"]>[0]) {
      state = state.update(spec).state;
    },
  } as unknown as EditorView;
}

describe("envolver (seleção vazia)", () => {
  it("negrito: insere o par com o cursor no meio", () => {
    const view = criarViewFalsa("oi mundo", 2);
    envolver("**")(view);
    expect(view.state.doc.toString()).toBe("oi**** mundo");
    expect(view.state.selection.main.from).toBe(4);
    expect(view.state.selection.main.to).toBe(4);
  });

  it("itálico: mesma regra com marcador de 1 caractere", () => {
    const view = criarViewFalsa("abc", 1);
    envolver("*")(view);
    expect(view.state.doc.toString()).toBe("a**bc");
    expect(view.state.selection.main.from).toBe(2);
  });

  it("código: cursor no fim da linha", () => {
    const view = criarViewFalsa("abc", 3);
    envolver("`")(view);
    expect(view.state.doc.toString()).toBe("abc``");
    expect(view.state.selection.main.from).toBe(4);
  });

  it("riscado: cursor no início da linha", () => {
    const view = criarViewFalsa("abc", 0);
    envolver("~~")(view);
    expect(view.state.doc.toString()).toBe("~~~~abc");
    expect(view.state.selection.main.from).toBe(2);
  });
});

describe("alternarHeading (seleção vazia)", () => {
  it("parágrafo comum vira heading", () => {
    const view = criarViewFalsa("título", 3);
    alternarHeading(2)(view);
    expect(view.state.doc.toString()).toBe("## título");
  });

  it("linha já no nível volta a parágrafo", () => {
    const view = criarViewFalsa("## título", 5);
    alternarHeading(2)(view);
    expect(view.state.doc.toString()).toBe("título");
  });
});

describe("alternarPrefixoLinha (seleção vazia)", () => {
  it("citação liga na linha do cursor", () => {
    const view = criarViewFalsa("frase", 2);
    alternarPrefixoLinha("> ")(view);
    expect(view.state.doc.toString()).toBe("> frase");
  });

  it("checkbox reconhece variações já marcadas ao desligar", () => {
    const view = criarViewFalsa("- [x] tarefa", 8);
    alternarPrefixoLinha("- [ ] ", ["- [x] ", "- [X] "])(view);
    expect(view.state.doc.toString()).toBe("tarefa");
  });
});

describe("alternarListaNumerada (seleção vazia)", () => {
  it("liga numeração começando em 1 na linha do cursor", () => {
    const view = criarViewFalsa("item", 1);
    alternarListaNumerada()(view);
    expect(view.state.doc.toString()).toBe("1. item");
  });

  it("desliga numeração existente", () => {
    const view = criarViewFalsa("1. item", 4);
    alternarListaNumerada()(view);
    expect(view.state.doc.toString()).toBe("item");
  });
});

describe("inserirLink (seleção vazia)", () => {
  it("insere o modelo com placeholder e seleciona a URL", () => {
    const view = criarViewFalsa("veja: ", 6);
    inserirLink()(view);
    expect(view.state.doc.toString()).toBe("veja: [link](url)");
    const sel = view.state.selection.main;
    expect(view.state.sliceDoc(sel.from, sel.to)).toBe("url");
  });
});
