import { describe, it, expect } from "vitest";

import {
  deleteColumn,
  deleteRow,
  insertColumn,
  insertRow,
  moveColumn,
  moveRow,
  parseTableText,
  serializeTable,
  setAlign,
  splitRowCells,
  type TableModel,
} from "./table-model";

// doc 14 §0 item 4: alignment (`:---`, `:---:`, `---:`) used to be parsed and then dropped on
// serialize — editing any cell of an aligned table silently erased the alignment from disk.
// This suite exists to pin the round-trip and keep it pinned through every operation.

describe("parseTableText / serializeTable: round-trip", () => {
  it("preserva alinhamento misto (esquerda, centro, direita, nenhum)", () => {
    const text = [
      "| Nome | Idade | Cidade | Nota |",
      "| :--- | :---: | ---: | --- |",
      "| Ana | 30 | SP | ok |",
    ].join("\n");
    const model = parseTableText(text);
    expect(model).not.toBeNull();
    expect(model!.aligns).toEqual(["left", "center", "right", null]);
    expect(serializeTable(model!)).toBe(text);
  });

  it("round-trip idempotente sem alinhamento (--- puro)", () => {
    const text = ["| A | B |", "| --- | --- |", "| 1 | 2 |"].join("\n");
    const model = parseTableText(text);
    expect(serializeTable(model!)).toBe(text);
  });

  it("preserva pipes escapados dentro de células", () => {
    const text = ["| A | B |", "| --- | --- |", "| a\\|b | c |"].join("\n");
    const model = parseTableText(text);
    expect(model!.rows[0]).toEqual(["a\\|b", "c"]);
    expect(serializeTable(model!)).toBe(text);
  });

  it("preserva células vazias, inclusive no meio da linha", () => {
    const text = ["| A | B | C |", "| --- | --- | --- |", "|  | meio |  |"].join("\n");
    const model = parseTableText(text);
    expect(model!.rows[0]).toEqual(["", "meio", ""]);
    expect(serializeTable(model!)).toBe(text);
  });

  it("retorna null para texto sem linha delimitadora válida", () => {
    expect(parseTableText("| A | B |\n| não é delimitador |")).toBeNull();
    expect(parseTableText("só uma linha")).toBeNull();
  });

  it("splitRowCells remove pipes externas e não quebra em pipe escapado", () => {
    expect(splitRowCells("| a | b\\|c | d |")).toEqual(["a", "b\\|c", "d"]);
  });
});

describe("insertRow / deleteRow", () => {
  const base: TableModel = {
    header: ["A", "B"],
    aligns: ["left", null],
    rows: [
      ["1", "2"],
      ["3", "4"],
    ],
  };

  it("insere linha vazia com o número certo de colunas, mantendo aligns", () => {
    const next = insertRow(base, 1);
    expect(next.rows).toEqual([
      ["1", "2"],
      ["", ""],
      ["3", "4"],
    ]);
    expect(next.aligns).toEqual(base.aligns);
  });

  it("insere no fim quando o índice passa do tamanho", () => {
    const next = insertRow(base, 99);
    expect(next.rows[next.rows.length - 1]).toEqual(["", ""]);
  });

  it("remove a linha do índice", () => {
    const next = deleteRow(base, 0);
    expect(next.rows).toEqual([["3", "4"]]);
  });

  it("deleteRow com índice fora do alcance é no-op", () => {
    expect(deleteRow(base, 5)).toEqual(base);
    expect(deleteRow(base, -1)).toEqual(base);
  });
});

describe("moveRow", () => {
  const base: TableModel = {
    header: ["A"],
    aligns: [null],
    rows: [["1"], ["2"], ["3"]],
  };

  it("move linha para outra posição", () => {
    const next = moveRow(base, 0, 2);
    expect(next.rows).toEqual([["2"], ["3"], ["1"]]);
  });

  it("mover para a mesma posição é um no-op de conteúdo", () => {
    const next = moveRow(base, 1, 1);
    expect(next.rows).toEqual(base.rows);
  });

  it("borda: mover a primeira linha para cima (to < 0) fica clampado, sem mudar a ordem", () => {
    const next = moveRow(base, 0, -1);
    expect(next.rows).toEqual(base.rows);
  });

  it("borda: mover a última linha para baixo (to além do fim) fica clampado", () => {
    const next = moveRow(base, 2, 99);
    expect(next.rows).toEqual(base.rows);
  });

  it("from fora do alcance é no-op", () => {
    expect(moveRow(base, 9, 0)).toEqual(base);
  });
});

describe("insertColumn / deleteColumn", () => {
  const base: TableModel = {
    header: ["A", "B"],
    aligns: ["left", "right"],
    rows: [["1", "2"]],
  };

  it("insere coluna vazia e sem alinhamento na posição pedida", () => {
    const next = insertColumn(base, 1);
    expect(next.header).toEqual(["A", "", "B"]);
    expect(next.aligns).toEqual(["left", null, "right"]);
    expect(next.rows).toEqual([["1", "", "2"]]);
  });

  it("excluir coluna mantém aligns em sincronia com as colunas restantes", () => {
    const next = deleteColumn(base, 0);
    expect(next.header).toEqual(["B"]);
    expect(next.aligns).toEqual(["right"]);
    expect(next.rows).toEqual([["2"]]);
  });

  it("excluir a última coluna é no-op", () => {
    const oneColumn: TableModel = { header: ["A"], aligns: ["left"], rows: [["1"]] };
    expect(deleteColumn(oneColumn, 0)).toEqual(oneColumn);
  });

  it("excluir coluna com índice fora do alcance é no-op", () => {
    expect(deleteColumn(base, 9)).toEqual(base);
  });
});

describe("moveColumn", () => {
  const base: TableModel = {
    header: ["A", "B", "C"],
    aligns: ["left", "center", "right"],
    rows: [["1", "2", "3"]],
  };

  it("move header, align e célula de cada linha juntos", () => {
    const next = moveColumn(base, 0, 2);
    expect(next.header).toEqual(["B", "C", "A"]);
    expect(next.aligns).toEqual(["center", "right", "left"]);
    expect(next.rows).toEqual([["2", "3", "1"]]);
  });

  it("mover para a mesma posição é um no-op de conteúdo", () => {
    expect(moveColumn(base, 1, 1)).toEqual(base);
  });

  it("borda: mover a primeira coluna para a esquerda fica clampada", () => {
    expect(moveColumn(base, 0, -1)).toEqual(base);
  });

  it("borda: mover a última coluna para a direita fica clampada", () => {
    expect(moveColumn(base, 2, 99)).toEqual(base);
  });
});

describe("setAlign", () => {
  it("define o alinhamento de uma coluna sem afetar as outras", () => {
    const base: TableModel = { header: ["A", "B"], aligns: [null, null], rows: [] };
    const next = setAlign(base, 1, "center");
    expect(next.aligns).toEqual([null, "center"]);
  });

  it("índice fora do alcance é no-op", () => {
    const base: TableModel = { header: ["A"], aligns: [null], rows: [] };
    expect(setAlign(base, 5, "left")).toEqual(base);
  });
});
