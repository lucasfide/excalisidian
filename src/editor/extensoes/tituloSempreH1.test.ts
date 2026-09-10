import { describe, it, expect } from "vitest";
import { EditorState, type ChangeSpec } from "@codemirror/state";

import { fimDoPrefixoTitulo, tituloSempreH1 } from "./tituloSempreH1";

describe("fimDoPrefixoTitulo", () => {
  it("H1 comum: prefixo é `# ` (2 caracteres)", () => {
    expect(fimDoPrefixoTitulo("# Título")).toBe(2);
  });

  it("H1 sem texto: prefixo continua sendo `# `", () => {
    expect(fimDoPrefixoTitulo("# ")).toBe(2);
  });

  it("espaço extra depois do `#` entra no prefixo protegido", () => {
    expect(fimDoPrefixoTitulo("#  Título")).toBe(3);
  });

  it("H2 não é título", () => {
    expect(fimDoPrefixoTitulo("## Subtítulo")).toBeNull();
  });

  it("parágrafo comum não é título", () => {
    expect(fimDoPrefixoTitulo("Só um parágrafo")).toBeNull();
  });

  it("`#` colado no texto não é heading", () => {
    expect(fimDoPrefixoTitulo("#semtexto")).toBeNull();
  });

  it("linha vazia não é título", () => {
    expect(fimDoPrefixoTitulo("")).toBeNull();
  });
});

describe("tituloSempreH1 (transactionFilter)", () => {
  function aplicar(doc: string, changes: ChangeSpec) {
    const state = EditorState.create({ doc, extensions: [tituloSempreH1] });
    return state.update({ changes }).state.doc.toString();
  }

  it("apagar o `#` do título é suprimido", () => {
    expect(aplicar("# Nota\n\ncorpo", { from: 0, to: 1 })).toBe("# Nota\n\ncorpo");
  });

  it("Backspace logo depois do `# ` não come o espaço", () => {
    expect(aplicar("# Nota\n\ncorpo", { from: 1, to: 2 })).toBe("# Nota\n\ncorpo");
  });

  it("selecionar a linha 1 inteira e digitar troca só o texto, mantém `# `", () => {
    expect(
      aplicar("# Nota\n\ncorpo", { from: 0, to: 6, insert: "Outra" }),
    ).toBe("# Outra\n\ncorpo");
  });

  it("apagar todo o texto do título deixa `# `", () => {
    expect(aplicar("# Nota\n\ncorpo", { from: 0, to: 6 })).toBe("# \n\ncorpo");
  });

  it("editar o texto do título depois do prefixo passa normal", () => {
    expect(
      aplicar("# Nota\n\ncorpo", { from: 6, to: 6, insert: " nova" }),
    ).toBe("# Nota nova\n\ncorpo");
  });

  it("nota sem H1 na linha 1: nada é protegido", () => {
    expect(aplicar("rascunho\n\ncorpo", { from: 0, to: 8, insert: "x" })).toBe("x\n\ncorpo");
  });

  it("linha 1 que é H2: nada é protegido", () => {
    expect(aplicar("## Sub\n\ncorpo", { from: 0, to: 1 })).toBe("# Sub\n\ncorpo");
  });
});
