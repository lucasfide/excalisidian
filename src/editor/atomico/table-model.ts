// [excalisidian] Pure GFM-table model: parse markdown text into a `TableModel`, serialize it
// back, and immutable operations over it (insert/delete/move row or column, set alignment).
//
// Split out of `table-widget.ts` (upstream's model was `{ header, rows }`, no alignment — see
// `LEIA-ME.md` for the vendoring rules) so that:
//   - alignment (`:---`, `:---:`, `---:`) round-trips through edit/insert/move/delete instead
//     of being silently dropped on the next serialize (doc 14 §0 item 4, the bug that
//     motivated this file);
//   - the model/operations are testable without a CodeMirror/lezer state, which is what makes
//     an exhaustive round-trip + edge-case test suite (`table-model.test.ts`) cheap to write.
//
// No CodeMirror or lezer imports here on purpose — `table-widget.ts` is the only caller that
// deals with the syntax tree, DOM, or editor transactions.

export type ColumnAlign = "left" | "center" | "right" | null;

export interface TableModel {
  header: string[];
  aligns: ColumnAlign[];
  rows: string[][];
}

// Split a raw GFM table row line on unescaped `|`. Doesn't rely on a lezer `TableCell` count —
// lezer emits NO node for an empty cell, so a node-based count silently drops blank columns,
// exactly what "insert column" creates. Splitting the pipe-delimited text keeps blank columns
// (and their positions) intact through the parse → serialize round-trip.
export function splitRowCells(line: string): string[] {
  let s = line.trim();
  // Strip the optional outer pipes so they don't yield phantom empty leading/trailing cells.
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);

  const cells: string[] = [];
  let buf = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    // A backslash escapes the next char (e.g. `\|` is a literal pipe in a GFM cell) — keep
    // both and don't treat the pipe as a separator.
    if (ch === "\\" && i + 1 < s.length) {
      buf += ch + s[i + 1];
      i++;
      continue;
    }
    if (ch === "|") {
      cells.push(buf.trim());
      buf = "";
      continue;
    }
    buf += ch;
  }
  cells.push(buf.trim());
  return cells;
}

// A delimiter cell is 1+ dashes with an optional leading/trailing `:`. `parseTableText` uses
// this both to recognize a delimiter row and to read each column's alignment from it.
const DELIMITER_CELL_RE = /^:?-+:?$/;

function parseAlignCell(cell: string): ColumnAlign {
  const s = cell.trim();
  const left = s.startsWith(":");
  const right = s.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return null;
}

function alignToDelimiterCell(align: ColumnAlign): string {
  if (align === "left") return ":---";
  if (align === "center") return ":---:";
  if (align === "right") return "---:";
  return "---";
}

// Escape cell content so it can't break the row's GFM structure: an unescaped `|` would split
// the cell into two columns, and a stray newline would terminate the table. A pipe that's
// already escaped (`\|` — e.g. round-tripping content the parser handed us) is left alone so
// serialize is idempotent.
function escapeCell(text: string): string {
  return text.replace(/\r?\n/g, " ").replace(/(?<!\\)\|/g, "\\|");
}

// Parse the raw markdown text of one GFM table (header line + delimiter line + zero or more
// body lines) into a `TableModel`. Returns `null` when `text` doesn't look like a table — no
// header, no valid delimiter row, or fewer than two non-blank lines.
export function parseTableText(text: string): TableModel | null {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return null;

  const header = splitRowCells(lines[0]);
  if (header.length === 0) return null;

  const delimiterCells = splitRowCells(lines[1]);
  if (
    delimiterCells.length === 0 ||
    !delimiterCells.every((cell) => DELIMITER_CELL_RE.test(cell.trim()))
  ) {
    return null;
  }

  const aligns: ColumnAlign[] = header.map((_, i) =>
    parseAlignCell(delimiterCells[i] ?? "-"),
  );
  const rows = lines.slice(2).map(splitRowCells);

  return { header, aligns, rows };
}

export function serializeTable(model: TableModel): string {
  const columnCount = model.header.length;
  const lines: string[] = [];
  lines.push("| " + model.header.map(escapeCell).join(" | ") + " |");
  lines.push(
    "| " +
      Array.from({ length: columnCount }, (_, i) =>
        alignToDelimiterCell(model.aligns[i] ?? null),
      ).join(" | ") +
      " |",
  );
  for (const row of model.rows) {
    const padded: string[] = [];
    for (let c = 0; c < columnCount; c++) padded.push(escapeCell(row[c] ?? ""));
    lines.push("| " + padded.join(" | ") + " |");
  }
  return lines.join("\n");
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

// index is a body-row index (0 = first row under the header), clamped to [0, rows.length] so
// an out-of-range index inserts at the nearest end instead of throwing.
export function insertRow(m: TableModel, index: number): TableModel {
  const rows = m.rows.slice();
  const at = clamp(index, 0, rows.length);
  rows.splice(at, 0, m.header.map(() => ""));
  return { ...m, rows };
}

export function deleteRow(m: TableModel, index: number): TableModel {
  if (index < 0 || index >= m.rows.length) return m;
  const rows = m.rows.slice();
  rows.splice(index, 1);
  return { ...m, rows };
}

// Moves a body row. Out-of-range `from` is a no-op; `to` is clamped into the valid range (this
// is what makes "move first row up" / "move last row down" — disabled in the menu, §1.3 —
// harmless if ever called: it just settles back on the same order).
export function moveRow(m: TableModel, from: number, to: number): TableModel {
  if (from < 0 || from >= m.rows.length) return m;
  const target = clamp(to, 0, m.rows.length - 1);
  if (target === from) return { ...m, rows: m.rows.slice() };
  const rows = m.rows.slice();
  const [moved] = rows.splice(from, 1);
  rows.splice(target, 0, moved);
  return { ...m, rows };
}

// index is a column index, clamped to [0, columnCount] so an out-of-range index inserts at the
// nearest end. The new column starts unaligned (`null`), matching a freshly inserted column
// having no delimiter markers yet.
export function insertColumn(m: TableModel, index: number): TableModel {
  const columnCount = m.header.length;
  const at = clamp(index, 0, columnCount);
  const header = m.header.slice();
  header.splice(at, 0, "");
  const aligns = m.aligns.slice();
  aligns.splice(at, 0, null);
  const rows = m.rows.map((row) => {
    const next = row.slice();
    next.splice(at, 0, "");
    return next;
  });
  return { header, aligns, rows };
}

// No-op when the table only has one column left — a zero-column table isn't representable as
// GFM (lezer wouldn't parse it back as a Table) and the widget would vanish mid-edit.
export function deleteColumn(m: TableModel, index: number): TableModel {
  if (m.header.length <= 1 || index < 0 || index >= m.header.length) return m;
  const header = m.header.slice();
  header.splice(index, 1);
  const aligns = m.aligns.slice();
  aligns.splice(index, 1);
  const rows = m.rows.map((row) => {
    const next = row.slice();
    next.splice(index, 1);
    return next;
  });
  return { header, aligns, rows };
}

// Moves a column, carrying its header cell, its alignment, and every row's cell at that index
// together. Out-of-range `from` is a no-op; `to` is clamped (same reasoning as `moveRow`).
export function moveColumn(m: TableModel, from: number, to: number): TableModel {
  const columnCount = m.header.length;
  if (from < 0 || from >= columnCount) return m;
  const target = clamp(to, 0, columnCount - 1);
  if (target === from) {
    return { header: m.header.slice(), aligns: m.aligns.slice(), rows: m.rows.map((r) => r.slice()) };
  }
  const header = m.header.slice();
  const [movedHeader] = header.splice(from, 1);
  header.splice(target, 0, movedHeader);

  const aligns = m.aligns.slice();
  const [movedAlign] = aligns.splice(from, 1);
  aligns.splice(target, 0, movedAlign);

  const rows = m.rows.map((row) => {
    const next = row.slice();
    const [movedCell] = next.splice(from, 1);
    next.splice(target, 0, movedCell ?? "");
    return next;
  });

  return { header, aligns, rows };
}

export function setAlign(m: TableModel, col: number, align: ColumnAlign): TableModel {
  if (col < 0 || col >= m.aligns.length) return m;
  const aligns = m.aligns.slice();
  aligns[col] = align;
  return { ...m, aligns };
}
