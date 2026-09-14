// Regressão do achado 10 da auditoria de 12/09: `Decoration.replace({ block: true })`
// fornecida por ViewPlugin faz o CodeMirror lançar
// RangeError("Block decorations may not be specified via plugins") — o embed quebrava a
// nota inteira em tela. As decorações agora vêm de um StateField (mesma forma que
// `atomico/image-blocks.ts` faz com imagens). Este teste monta um EditorState real: se o
// formato regredir para plugin, o próprio campo exportado desaparece (erro de compilação),
// e aqui a decoração precisa existir e ser de bloco.
import { describe, it, expect, vi } from "vitest";
import { EditorState } from "@codemirror/state";

vi.mock("../../estado/vaultStore", () => ({
  useVaultStore: {
    getState: () => ({
      adapter: {},
      resolver: (alvo: string) =>
        alvo === "D.draw" ? "D.draw.md" : alvo === "Nota" ? "Nota.md" : null,
    }),
  },
}));
vi.mock("../../estado/workspaceStore", () => ({
  useWorkspaceStore: { getState: () => ({ caminhoAtivo: "Nota.md" }) },
}));
vi.mock("../../canvas/paletaCanvas", () => ({ temaEscuroAtivo: () => false }));
vi.mock("../../canvas/renderSvg", () => ({
  renderizarSvg: async () => {
    throw new Error("não deve renderizar no teste de estado");
  },
}));

import { embedDesenho, embedDesenhoField } from "./embedDesenho";

function decoracoesDe(doc: string) {
  const state = EditorState.create({ doc, extensions: [embedDesenho] });
  const deco = state.field(embedDesenhoField);
  const encontradas: { from: number; to: number; block: boolean }[] = [];
  deco.between(0, state.doc.length, (from, to, d) => {
    encontradas.push({ from, to, block: (d.spec as { block?: boolean }).block === true });
  });
  return encontradas;
}

describe("embedDesenho — StateField de decorações de bloco", () => {
  it("embed que resolve para desenho produz uma decoração de bloco na linha certa", () => {
    const doc = "# Nota\n\n![[D.draw]]\n\ntexto\n";
    const encontradas = decoracoesDe(doc);

    expect(encontradas).toHaveLength(1);
    expect(encontradas[0].block).toBe(true);
    const state = EditorState.create({ doc, extensions: [embedDesenho] });
    const linha = state.doc.line(3);
    expect(encontradas[0].from).toBe(linha.from);
    expect(encontradas[0].to).toBe(linha.to);
  });

  it("sem embed, ou embed que não resolve a desenho, não decora nada", () => {
    expect(decoracoesDe("# Nota\n\n[[D.draw]]\n")).toEqual([]);
    expect(decoracoesDe("# Nota\n\n![[Inexistente]]\n")).toEqual([]);
  });
});
