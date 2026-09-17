// Regra do doc 04 §3.4 (usuário, 16/09/2026): sem seleção, a barra só aparece numa linha
// vazia. `construirTooltip` é puro sobre `EditorState` (não toca em `view`), então dá pra
// testar sem uma `EditorView`/DOM de verdade — só precisa dos campos de foco/acoplada no
// estado, com o foco já concedido via `efeitoFoco` (ver comentário de exportação no arquivo).
import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";

import { campoFoco, campoAcoplada, efeitoFoco, construirTooltip } from "./barraFlutuante";

function estadoComFoco(doc: string, selecao: number | { anchor: number; head: number }) {
  const inicial = EditorState.create({
    doc,
    selection: typeof selecao === "number" ? { anchor: selecao } : selecao,
    extensions: [campoFoco, campoAcoplada],
  });
  // `state.update` é puro — não precisa de EditorView pra aplicar o efeito de foco.
  return inicial.update({
    effects: efeitoFoco.of({ temFoco: true, naCelula: false }),
  }).state;
}

describe("construirTooltip — barra flutuante sem seleção", () => {
  it("aparece com o cursor numa linha vazia", () => {
    const estado = estadoComFoco("primeira linha\n\nterceira linha", 15); // linha 2, vazia
    const tooltip = construirTooltip(estado);
    expect(tooltip).not.toBeNull();
    expect(tooltip?.pos).toBe(15);
    expect(tooltip?.end).toBeUndefined();
  });

  it("não aparece com o cursor numa linha com texto, sem seleção", () => {
    const estado = estadoComFoco("primeira linha\nsegunda linha", 20); // dentro da linha 2
    expect(construirTooltip(estado)).toBeNull();
  });

  it("aparece com seleção, mesmo a linha tendo texto", () => {
    const estado = estadoComFoco("primeira linha\nsegunda linha", { anchor: 15, head: 21 });
    const tooltip = construirTooltip(estado);
    expect(tooltip).not.toBeNull();
    expect(tooltip?.pos).toBe(15);
    expect(tooltip?.end).toBe(21);
  });

  it("some assim que a linha vazia ganha a primeira letra", () => {
    const vazia = estadoComFoco("linha 1\n\nlinha 3", 8);
    expect(construirTooltip(vazia)).not.toBeNull();

    const digitada = vazia.update({ changes: { from: 8, insert: "a" }, selection: { anchor: 9 } })
      .state;
    expect(construirTooltip(digitada)).toBeNull();
  });

  it("sem foco no editor, não aparece nem numa linha vazia", () => {
    const semFoco = EditorState.create({
      doc: "\n",
      selection: { anchor: 0 },
      extensions: [campoFoco, campoAcoplada],
    });
    expect(construirTooltip(semFoco)).toBeNull();
  });
});
