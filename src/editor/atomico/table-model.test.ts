import { describe, it, expect } from "vitest";

import {
  clearWidths,
  deleteColumn,
  deleteRow,
  insertColumn,
  insertRow,
  MIN_WIDTH_DASHES,
  moveColumn,
  moveRow,
  normalizeWidths,
  parseTableText,
  resizeColumns,
  serializeTable,
  setAlign,
  splitRowCells,
  TOTAL_WIDTH_DASHES,
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

// [excalisidian] Column widths: a delimiter cell with more than 3 dashes stores a fraction of
// the table's total width instead of just marking the column as present, so the widget can
// persist a resized column to disk (doc 14 — resizable columns).
describe("parseTableText: largura de coluna", () => {
  it("delimitador --- puro continua largura automática (widths null)", () => {
    const text = ["| A | B |", "| --- | --- |", "| 1 | 2 |"].join("\n");
    const model = parseTableText(text);
    expect(model!.widths).toBeNull();
  });

  it("delimitador de um único traço continua largura automática", () => {
    const text = ["| A | B |", "| - | - |", "| 1 | 2 |"].join("\n");
    const model = parseTableText(text);
    expect(model!.widths).toBeNull();
  });

  it("mistura de delimitadores com no máximo 3 traços continua automática", () => {
    const text = ["| A | B | C |", "| :---: | -- | - |", "| 1 | 2 | 3 |"].join("\n");
    const model = parseTableText(text);
    expect(model!.widths).toBeNull();
  });

  it("delimitador com mais de 3 traços em qualquer coluna vira largura proporcional", () => {
    const text = ["| A | B |", "| ------ | --- |", "| 1 | 2 |"].join("\n");
    const model = parseTableText(text);
    expect(model!.widths).not.toBeNull();
    expect(model!.widths![0]).toBeCloseTo(2 / 3);
    expect(model!.widths![1]).toBeCloseTo(1 / 3);
  });

  it("os ':' de alinhamento não contam como traço", () => {
    const text = ["| A | B |", "| :--------: | --- |", "| 1 | 2 |"].join("\n");
    const model = parseTableText(text);
    // ":--------:" tem 8 traços, "---" tem 3 → proporcional 8/11 e 3/11.
    expect(model!.widths).not.toBeNull();
    expect(model!.widths![0]).toBeCloseTo(8 / 11);
    expect(model!.widths![1]).toBeCloseTo(3 / 11);
  });

  it("célula delimitadora ausente para uma coluna do cabeçalho conta como 3 traços", () => {
    const text = ["| A | B | C |", "| -------- |", "| 1 | 2 | 3 |"].join("\n");
    const model = parseTableText(text);
    // "--------" = 8 traços; colunas B e C sem delimitador contam como 3 cada → soma 14.
    expect(model!.widths).not.toBeNull();
    expect(model!.widths![0]).toBeCloseTo(8 / 14);
    expect(model!.widths![1]).toBeCloseTo(3 / 14);
    expect(model!.widths![2]).toBeCloseTo(3 / 14);
  });
});

describe("serializeTable: largura de coluna", () => {
  it("widths null/undefined serializa exatamente como hoje", () => {
    const text = [
      "| Nome | Idade | Cidade | Nota |",
      "| :--- | :---: | ---: | --- |",
      "| Ana | 30 | SP | ok |",
    ].join("\n");
    const model = parseTableText(text);
    expect(serializeTable({ ...model!, widths: undefined })).toBe(text);
    expect(serializeTable({ ...model!, widths: null })).toBe(text);
  });

  it("widths presentes geram traços proporcionais preservando os ':' de alinhamento", () => {
    const model: TableModel = {
      header: ["A", "B"],
      aligns: ["left", "right"],
      rows: [["1", "2"]],
      widths: [0.5, 0.5],
    };
    const text = serializeTable(model);
    const lines = text.split("\n");
    const expectedDashes = 0.5 * TOTAL_WIDTH_DASHES;
    expect(lines[1]).toBe(
      "| :" + "-".repeat(expectedDashes) + " | " + "-".repeat(expectedDashes) + ": |",
    );
  });

  it("nunca serializa menos que MIN_WIDTH_DASHES traços mesmo com fração minúscula", () => {
    const model: TableModel = {
      header: ["A", "B"],
      aligns: [null, null],
      rows: [],
      widths: [0.01, 0.99],
    };
    const text = serializeTable(model);
    const delimiterCells = splitRowCells(text.split("\n")[1]);
    const dashCount = delimiterCells[0].replace(/:/g, "").length;
    expect(dashCount).toBe(MIN_WIDTH_DASHES);
  });
});

describe("round-trip de largura", () => {
  it("parse(serialize(m)) preserva frações aproximadamente", () => {
    const model: TableModel = {
      header: ["A", "B", "C"],
      aligns: [null, "center", null],
      rows: [["1", "2", "3"]],
      widths: [0.5, 0.2, 0.3],
    };
    const text = serializeTable(model);
    const reparsed = parseTableText(text);
    expect(reparsed!.widths).not.toBeNull();
    reparsed!.widths!.forEach((w, i) => {
      expect(w).toBeCloseTo(model.widths![i], 1);
    });
  });

  it("serialize(parse(texto)) é idempotente para texto já serializado com largura", () => {
    const model: TableModel = {
      header: ["A", "B"],
      aligns: [null, null],
      rows: [["1", "2"]],
      widths: [0.6, 0.4],
    };
    const once = serializeTable(model);
    const reparsed = parseTableText(once);
    const twice = serializeTable(reparsed!);
    expect(twice).toBe(once);
  });
});

describe("normalizeWidths", () => {
  it("divide pela soma", () => {
    expect(normalizeWidths([1, 1, 2])).toEqual([0.25, 0.25, 0.5]);
  });

  it("soma zero vira frações iguais", () => {
    expect(normalizeWidths([0, 0, 0])).toEqual([1 / 3, 1 / 3, 1 / 3]);
  });

  it("array vazio retorna array vazio", () => {
    expect(normalizeWidths([])).toEqual([]);
  });
});

describe("resizeColumns", () => {
  const base: TableModel = {
    header: ["A", "B", "C"],
    aligns: [null, null, null],
    rows: [],
    widths: [1 / 3, 1 / 3, 1 / 3],
  };

  it("delta positivo cresce a coluna da esquerda e encolhe a da direita, soma zero", () => {
    const next = resizeColumns(base, 0, 0.1, 0.1);
    expect(next.widths![0]).toBeCloseTo(1 / 3 + 0.1);
    expect(next.widths![1]).toBeCloseTo(1 / 3 - 0.1);
    expect(next.widths![2]).toBeCloseTo(1 / 3);
  });

  it("delta negativo encolhe a esquerda e cresce a direita", () => {
    const next = resizeColumns(base, 1, -0.1, 0.1);
    expect(next.widths![1]).toBeCloseTo(1 / 3 - 0.1);
    expect(next.widths![2]).toBeCloseTo(1 / 3 + 0.1);
    expect(next.widths![0]).toBeCloseTo(1 / 3);
  });

  it("clampa para não deixar nenhuma coluna abaixo de minFraction", () => {
    const next = resizeColumns(base, 0, 10, 0.1);
    expect(next.widths![0]).toBeCloseTo(2 / 3 - 0.1);
    expect(next.widths![1]).toBeCloseTo(0.1);
    const sum = next.widths![0] + next.widths![1];
    expect(sum).toBeCloseTo(2 / 3);
  });

  it("se as duas colunas juntas não comportam 2×minFraction, é no-op", () => {
    const tight: TableModel = {
      header: ["A", "B"],
      aligns: [null, null],
      rows: [],
      widths: [0.05, 0.05],
    };
    expect(resizeColumns(tight, 0, 0.01, 0.1)).toEqual(tight);
  });

  it("border inválido (negativo ou último) é no-op", () => {
    expect(resizeColumns(base, -1, 0.1, 0.1)).toEqual(base);
    expect(resizeColumns(base, 2, 0.1, 0.1)).toEqual(base);
  });

  it("widths null é no-op", () => {
    const automatic: TableModel = { header: ["A", "B"], aligns: [null, null], rows: [] };
    expect(resizeColumns(automatic, 0, 0.1, 0.1)).toEqual(automatic);
  });

  it("é imutável: não muda o array widths original", () => {
    const original = base.widths!.slice();
    resizeColumns(base, 0, 0.1, 0.1);
    expect(base.widths).toEqual(original);
  });
});

describe("clearWidths", () => {
  it("define widths como null sem alterar o resto", () => {
    const model: TableModel = {
      header: ["A", "B"],
      aligns: ["left", null],
      rows: [["1", "2"]],
      widths: [0.5, 0.5],
    };
    const next = clearWidths(model);
    expect(next.widths).toBeNull();
    expect(next.header).toEqual(model.header);
    expect(next.aligns).toEqual(model.aligns);
    expect(next.rows).toEqual(model.rows);
  });
});

describe("operações de coluna preservam widths", () => {
  it("insertColumn: nova coluna recebe 1/nAntigo e tudo é renormalizado", () => {
    const base: TableModel = {
      header: ["A", "B"],
      aligns: [null, null],
      rows: [["1", "2"]],
      widths: [0.5, 0.5],
    };
    const next = insertColumn(base, 1);
    // fração bruta antes de renormalizar: [0.5, 0.5(=1/2), 0.5] soma 1.5 → normaliza /1.5
    expect(next.widths).not.toBeNull();
    expect(next.widths!.length).toBe(3);
    expect(next.widths![0]).toBeCloseTo(0.5 / 1.5);
    expect(next.widths![1]).toBeCloseTo(0.5 / 1.5);
    expect(next.widths![2]).toBeCloseTo(0.5 / 1.5);
    const sum = next.widths!.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1);
  });

  it("insertColumn sem widths continua sem widths", () => {
    const base: TableModel = { header: ["A", "B"], aligns: [null, null], rows: [["1", "2"]] };
    const next = insertColumn(base, 1);
    expect(next.widths).toBeUndefined();
  });

  it("deleteColumn: remove a fração e renormaliza", () => {
    const base: TableModel = {
      header: ["A", "B", "C"],
      aligns: [null, null, null],
      rows: [["1", "2", "3"]],
      widths: [0.5, 0.3, 0.2],
    };
    const next = deleteColumn(base, 0);
    expect(next.widths!.length).toBe(2);
    expect(next.widths![0]).toBeCloseTo(0.3 / 0.5);
    expect(next.widths![1]).toBeCloseTo(0.2 / 0.5);
  });

  it("deleteColumn com 1 coluna continua no-op mesmo com widths", () => {
    const oneColumn: TableModel = { header: ["A"], aligns: ["left"], rows: [["1"]], widths: [1] };
    expect(deleteColumn(oneColumn, 0)).toEqual(oneColumn);
  });

  it("moveColumn: a fração anda junto com a coluna", () => {
    const base: TableModel = {
      header: ["A", "B", "C"],
      aligns: [null, null, null],
      rows: [["1", "2", "3"]],
      widths: [0.5, 0.3, 0.2],
    };
    const next = moveColumn(base, 0, 2);
    expect(next.header).toEqual(["B", "C", "A"]);
    expect(next.widths).toEqual([0.3, 0.2, 0.5]);
  });

  it("moveColumn para a mesma posição preserva widths (caminho antes reconstruía sem widths)", () => {
    const base: TableModel = {
      header: ["A", "B", "C"],
      aligns: [null, null, null],
      rows: [["1", "2", "3"]],
      widths: [0.5, 0.3, 0.2],
    };
    const next = moveColumn(base, 1, 1);
    expect(next.widths).toEqual(base.widths);
  });

  it("insertRow/deleteRow/moveRow/setAlign preservam widths", () => {
    const base: TableModel = {
      header: ["A", "B"],
      aligns: [null, null],
      rows: [["1", "2"]],
      widths: [0.5, 0.5],
    };
    expect(insertRow(base, 0).widths).toEqual(base.widths);
    expect(deleteRow(base, 0).widths).toEqual(base.widths);
    expect(moveRow({ ...base, rows: [["1", "2"], ["3", "4"]] }, 0, 1).widths).toEqual(base.widths);
    expect(setAlign(base, 0, "center").widths).toEqual(base.widths);
  });
});
