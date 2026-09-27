import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView, type DecorationSet } from "@codemirror/view";

import { caminhoDaNota } from "./caminhoDaNota";

function decoracoes(caminho: string, doc = "# Título\n\ncorpo") {
  let state = EditorState.create({ doc, extensions: caminhoDaNota(caminho) });
  const conjuntos = () =>
    state.facet(EditorView.decorations).filter((d): d is DecorationSet => typeof d !== "function");
  return {
    conjuntos,
    editar(insert: string, from = 0, to = 0) {
      state = state.update({ changes: { from, to, insert } }).state;
    },
  };
}

function widgets(conjunto: DecorationSet) {
  const achados: { pos: number; texto: string; bloco: boolean }[] = [];
  conjunto.between(0, Number.MAX_SAFE_INTEGER, (from, _to, deco) => {
    const w = deco.spec.widget as { pastas: string[] };
    achados.push({ pos: from, texto: w.pastas.join(" / "), bloco: deco.spec.block === true });
  });
  return achados;
}

describe("caminhoDaNota", () => {
  it("nota na raiz não ganha nenhuma linha acima do título", () => {
    expect(caminhoDaNota("Nota.md")).toEqual([]);
  });

  it("mostra as pastas, em ordem, num widget de bloco no topo", () => {
    const { conjuntos } = decoracoes("Projetos/Epitéria/Checkpoint.md");
    const todos = conjuntos().flatMap(widgets);
    expect(todos).toEqual([{ pos: 0, texto: "Projetos / Epitéria", bloco: true }]);
  });

  it("continua no topo depois de editar o começo do documento", () => {
    const d = decoracoes("Diário/2026-09-18.md");
    d.editar("x", 0);
    d.editar("", 0, 3);
    expect(d.conjuntos().flatMap(widgets)).toEqual([{ pos: 0, texto: "Diário", bloco: true }]);
  });
});
