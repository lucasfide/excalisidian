import { describe, it, expect } from "vitest";

import {
  gerarIdSeparador,
  inserirNoTopo,
  removerItem,
  renomearItem,
  moverItem,
  adicionarSeparador,
  removerSeparador,
  reordenarNivel,
} from "./customOrder";

describe("gerarIdSeparador", () => {
  it("gera sep- seguido de 6 caracteres alfanuméricos minúsculos, sempre diferente", () => {
    const a = gerarIdSeparador();
    const b = gerarIdSeparador();
    expect(a).toMatch(/^sep-[a-z0-9]{6}$/);
    expect(a).not.toBe(b);
  });
});

describe("inserirNoTopo", () => {
  it("adiciona no início do array daquela pasta", () => {
    const r = inserirNoTopo({ "": ["A.md"] }, "", "B.md");
    expect(r[""]).toEqual(["B.md", "A.md"]);
  });

  it("cria o array se a pasta ainda não tinha entrada", () => {
    const r = inserirNoTopo({}, "Projetos", "Nota.md");
    expect(r).toEqual({ Projetos: ["Nota.md"] });
  });

  it("não muta o customOrder original", () => {
    const original = { "": ["A.md"] };
    inserirNoTopo(original, "", "B.md");
    expect(original[""]).toEqual(["A.md"]);
  });
});

describe("removerItem", () => {
  it("remove só a entrada pedida, mantendo o resto", () => {
    const r = removerItem({ "": ["A.md", "B.md", "C.md"] }, "", "B.md");
    expect(r[""]).toEqual(["A.md", "C.md"]);
  });

  it("pasta sem entrada não quebra", () => {
    expect(removerItem({}, "Projetos", "X.md")).toEqual({});
  });
});

describe("renomearItem", () => {
  it("troca o nome na mesma posição", () => {
    const r = renomearItem({ "": ["A.md", "B.md"] }, "", "A.md", "Z.md");
    expect(r[""]).toEqual(["Z.md", "B.md"]);
  });

  it("item que não estava na lista: nada a fazer, devolve igual", () => {
    const r = renomearItem({ "": ["A.md"] }, "", "Ausente.md", "Z.md");
    expect(r[""]).toEqual(["A.md"]);
  });
});

describe("moverItem", () => {
  it("remove da pasta de origem e insere no topo da pasta de destino", () => {
    const r = moverItem(
      { "": ["Nota.md"], Projetos: ["Existente.md"] },
      "",
      "Projetos",
      "Nota.md",
    );
    expect(r[""]).toEqual([]);
    expect(r.Projetos).toEqual(["Nota.md", "Existente.md"]);
  });
});

describe("adicionarSeparador / removerSeparador", () => {
  it("adiciona no fim da raiz e devolve o id gerado", () => {
    const { customOrder, id } = adicionarSeparador({ "": ["A.md"] });
    expect(customOrder[""]).toEqual(["A.md", id]);
    expect(id).toMatch(/^sep-[a-z0-9]{6}$/);
  });

  it("cria a chave raiz se ainda não existia", () => {
    const { customOrder, id } = adicionarSeparador({});
    expect(customOrder[""]).toEqual([id]);
  });

  it("removerSeparador tira só aquele id", () => {
    const r = removerSeparador({ "": ["A.md", "sep-abc123", "B.md"] }, "sep-abc123");
    expect(r[""]).toEqual(["A.md", "B.md"]);
  });
});

describe("reordenarNivel", () => {
  it("substitui o array daquele nível pela nova ordem", () => {
    const r = reordenarNivel({ "": ["A.md", "B.md"] }, "", ["B.md", "A.md"]);
    expect(r[""]).toEqual(["B.md", "A.md"]);
  });

  it("não mexe em outros níveis", () => {
    const r = reordenarNivel({ "": ["A.md"], Projetos: ["X.md"] }, "", ["A.md"]);
    expect(r.Projetos).toEqual(["X.md"]);
  });
});
