import { describe, it, expect } from "vitest";
import { filtrarGlossario, normalizarBusca } from "./filtrarGlossario";

const itens = [
  { descricao: "Negrito", grupo: "Nota: formatação", extra: "**texto** ctrl b" },
  { descricao: "Fechar a aba", grupo: "Abas e divisões", extra: "ctrl w" },
  { descricao: "Destaque", grupo: "Texto", extra: "==texto==" },
];
const f = (q: string) => filtrarGlossario(itens, q, (i) => i.extra).map((i) => i.descricao);

describe("filtrarGlossario", () => {
  it("consulta vazia devolve tudo", () => expect(f("  ")).toHaveLength(3));
  it("ignora caixa e acento", () => {
    expect(f("FORMATACAO")).toEqual(["Negrito"]);
    expect(f("divisoes")).toEqual(["Fechar a aba"]);
  });
  it("acha por tecla, com ou sem +", () => {
    expect(f("ctrl w")).toEqual(["Fechar a aba"]);
    expect(f("ctrl+w")).toEqual(["Fechar a aba"]);
  });
  it("acha por símbolo", () => expect(f("==")).toEqual(["Destaque"]));
  it("todas as palavras precisam bater", () => expect(f("fechar negrito")).toEqual([]));
  it("normalizarBusca", () => expect(normalizarBusca(" Ação+Ctrl ")).toBe("acao ctrl"));
});
