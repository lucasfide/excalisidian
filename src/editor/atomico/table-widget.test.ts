import { describe, it, expect } from "vitest";

import { gapToMoveTarget, isNoopGap, nearestGapIndex, nearestResizeBorder } from "./table-widget";

// Pure geometry helpers behind the row/column drag handles (doc 14 §1.3/§2.3): given the
// screen-space boundaries between rows (or columns) and a pointer position, which "gap" does a
// drop land on, is that gap a no-op, and what index does `moveRow`/`moveColumn` need. No DOM
// involved — the boundaries are just numbers a caller (here, `attachTableControls`) would read
// off `getBoundingClientRect()`.

describe("nearestGapIndex", () => {
  // Four rows -> five gaps (before row 0, between each pair, after row 3), boundaries at
  // 0, 10, 20, 30, 40.
  const boundaries = [0, 10, 20, 30, 40];

  it("escolhe o gap exato quando o ponteiro está em cima de uma fronteira", () => {
    expect(nearestGapIndex(boundaries, 20)).toBe(2);
  });

  it("escolhe o gap mais próximo entre duas fronteiras", () => {
    expect(nearestGapIndex(boundaries, 24)).toBe(2);
    expect(nearestGapIndex(boundaries, 26)).toBe(3);
  });

  it("escolhe a primeira fronteira quando o ponteiro está antes de tudo", () => {
    expect(nearestGapIndex(boundaries, -100)).toBe(0);
  });

  it("escolhe a última fronteira quando o ponteiro está depois de tudo", () => {
    expect(nearestGapIndex(boundaries, 1000)).toBe(4);
  });

  it("funciona com uma única fronteira (tabela de uma linha só)", () => {
    expect(nearestGapIndex([5], 999)).toBe(0);
  });
});

describe("isNoopGap", () => {
  it("o próprio lugar do item (gap === origem) é no-op", () => {
    expect(isNoopGap(2, 2)).toBe(true);
  });

  it("logo depois do item (gap === origem + 1) também é no-op — é onde ele já está", () => {
    expect(isNoopGap(2, 3)).toBe(true);
  });

  it("qualquer outro gap não é no-op", () => {
    expect(isNoopGap(2, 0)).toBe(false);
    expect(isNoopGap(2, 1)).toBe(false);
    expect(isNoopGap(2, 4)).toBe(false);
  });
});

describe("gapToMoveTarget", () => {
  it("gap antes da origem: o índice não muda (nada foi removido antes dele)", () => {
    expect(gapToMoveTarget(3, 0)).toBe(0);
    expect(gapToMoveTarget(3, 1)).toBe(1);
  });

  it("gap depois da origem: desconta o item removido", () => {
    expect(gapToMoveTarget(0, 3)).toBe(2);
    expect(gapToMoveTarget(1, 4)).toBe(3);
  });

  it("mover a primeira linha para o fim (caso do teste manual do doc 14)", () => {
    // 4 linhas (origem 0), soltar depois da última -> gap 4 -> índice final 3.
    expect(gapToMoveTarget(0, 4)).toBe(3);
  });
});

// Pure hit-testing behind the column-resize handle (doc 14 §1.5): given the screen-space X of
// every INTERNAL column border (never the table's outer edges — those belong to the add-column
// strip, not to resizing) and a pointer position, which border (if any) is close enough to grab.
describe("nearestResizeBorder", () => {
  // Three columns -> two internal borders, at x = 100 and x = 220.
  const borders = [100, 220];

  it("acha a borda quando o ponteiro está em cima dela", () => {
    expect(nearestResizeBorder(borders, 100, 4)).toBe(0);
    expect(nearestResizeBorder(borders, 220, 4)).toBe(1);
  });

  it("acha a borda dentro da tolerância", () => {
    expect(nearestResizeBorder(borders, 103, 4)).toBe(0);
    expect(nearestResizeBorder(borders, 217, 4)).toBe(1);
  });

  it("nenhuma borda fora da tolerância — não é a borda externa", () => {
    expect(nearestResizeBorder(borders, 90, 4)).toBeNull();
    expect(nearestResizeBorder(borders, 230, 4)).toBeNull();
    expect(nearestResizeBorder(borders, 160, 4)).toBeNull();
  });

  it("sem bordas internas (tabela de uma coluna) nunca acha nada", () => {
    expect(nearestResizeBorder([], 100, 4)).toBeNull();
  });

  it("escolhe a mais próxima quando duas estão dentro da tolerância", () => {
    expect(nearestResizeBorder([100, 103], 101, 4)).toBe(0);
    expect(nearestResizeBorder([100, 103], 102, 4)).toBe(1);
  });
});
