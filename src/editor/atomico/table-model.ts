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
  // [excalisidian] Column widths (doc 14 — resizable columns): fractions of the table's total
  // width, one per column, summing to 1. `null`/`undefined` means automatic width — the browser
  // sizes columns by content, same as before this field existed. Optional so code that still
  // builds a bare `{ header, aligns, rows }` keeps compiling.
  widths?: number[] | null;
}

// [excalisidian] Resizing a column persists to disk as extra dashes on its delimiter cell
// (`MIN_WIDTH_DASHES`..`TOTAL_WIDTH_DASHES`) instead of a separate frontmatter/config field, so
// widths survive copy-paste and editing outside the app. `MIN_WIDTH_DASHES` is the floor: a
// delimiter cell that round-tripped down to 3 dashes or fewer would read back as "automatic"
// (see `parseTableText`), silently discarding a width the user set on purpose.
export const MIN_WIDTH_DASHES = 4;
export const TOTAL_WIDTH_DASHES = 60;

// [excalisidian] Turn arbitrary positive numbers into fractions that sum to 1. Used both to
// derive `widths` from a delimiter row's dash counts on parse, and to renormalize after
// insertColumn/deleteColumn change the number of columns. A zero (or empty) sum has no
// meaningful ratio to preserve, so it falls back to equal fractions rather than dividing by 0.
export function normalizeWidths(values: number[]): number[] {
  const n = values.length;
  if (n === 0) return [];
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum === 0) return values.map(() => 1 / n);
  return values.map((v) => v / sum);
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

// [excalisidian] Dash count of a delimiter cell, `:` alignment markers excluded — this is the
// on-disk encoding of a column's stored width (see `MIN_WIDTH_DASHES`/`TOTAL_WIDTH_DASHES`
// above and `parseTableText` below).
function countDelimiterDashes(cell: string): number {
  return (cell.match(/-/g) ?? []).length;
}

// [excalisidian] Render one delimiter cell from a stored width fraction. The dash count scales
// with the fraction of `TOTAL_WIDTH_DASHES`, floored at `MIN_WIDTH_DASHES` so a resized column
// never rounds back down to a delimiter cell that reads as "automatic" on the next parse.
function alignToDelimiterCellWithWidth(align: ColumnAlign, width: number): string {
  const dashes = "-".repeat(Math.max(MIN_WIDTH_DASHES, Math.round(width * TOTAL_WIDTH_DASHES)));
  if (align === "left") return ":" + dashes;
  if (align === "center") return ":" + dashes + ":";
  if (align === "right") return dashes + ":";
  return dashes;
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

  // [excalisidian] A delimiter cell missing for one of the header's columns counts as 3 dashes
  // — same "no width info here" default used for alignment above — so a short/malformed
  // delimiter row never accidentally reads as a stored width.
  const dashCounts = header.map((_, i) => countDelimiterDashes(delimiterCells[i] ?? "---"));
  const widths = dashCounts.some((d) => d > 3) ? normalizeWidths(dashCounts) : null;

  return { header, aligns, rows, widths };
}

export function serializeTable(model: TableModel): string {
  const columnCount = model.header.length;
  const lines: string[] = [];
  lines.push("| " + model.header.map(escapeCell).join(" | ") + " |");
  lines.push(
    "| " +
      Array.from({ length: columnCount }, (_, i) => {
        const align = model.aligns[i] ?? null;
        // [excalisidian] `widths` present → proportional delimiter (stores the resized width);
        // otherwise the original fixed `---`/`:---`/`:---:`/`---:` markers, unchanged.
        return model.widths
          ? alignToDelimiterCellWithWidth(align, model.widths[i] ?? 1 / columnCount)
          : alignToDelimiterCell(align);
      }).join(" | ") +
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
  const result: TableModel = { header, aligns, rows };
  // [excalisidian] The new column starts at "one column's worth" of the old table, then
  // everything renormalizes back to summing to 1 — matches how a real column would eat into
  // its siblings' space if it had been there from the start.
  if (m.widths) {
    const widths = m.widths.slice();
    widths.splice(at, 0, 1 / columnCount);
    result.widths = normalizeWidths(widths);
  }
  return result;
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
  const result: TableModel = { header, aligns, rows };
  if (m.widths) {
    const widths = m.widths.slice();
    widths.splice(index, 1);
    result.widths = normalizeWidths(widths);
  }
  return result;
}

// Moves a column, carrying its header cell, its alignment, and every row's cell at that index
// together. Out-of-range `from` is a no-op; `to` is clamped (same reasoning as `moveRow`).
export function moveColumn(m: TableModel, from: number, to: number): TableModel {
  const columnCount = m.header.length;
  if (from < 0 || from >= columnCount) return m;
  const target = clamp(to, 0, columnCount - 1);
  if (target === from) {
    return {
      header: m.header.slice(),
      aligns: m.aligns.slice(),
      rows: m.rows.map((r) => r.slice()),
      // [excalisidian] This same-position path used to reconstruct the model by hand and drop
      // `widths` on the floor — fixed so a no-op move never silently clears a resized column.
      ...(m.widths ? { widths: m.widths.slice() } : {}),
    };
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

  const result: TableModel = { header, aligns, rows };
  // [excalisidian] The width fraction travels with the column, same as header/align/cells.
  if (m.widths) {
    const widths = m.widths.slice();
    const [movedWidth] = widths.splice(from, 1);
    widths.splice(target, 0, movedWidth);
    result.widths = widths;
  }
  return result;
}

export function setAlign(m: TableModel, col: number, align: ColumnAlign): TableModel {
  if (col < 0 || col >= m.aligns.length) return m;
  const aligns = m.aligns.slice();
  aligns[col] = align;
  return { ...m, aligns };
}

// [excalisidian] Drag the border between column `border` and `border + 1` by `delta` (a
// fraction of the table's total width). Grows the left column and shrinks the right one by the
// same amount so the total stays 1 — every other column is untouched. `minFraction` is the
// floor for both sides; if they can't each keep at least `minFraction` even split evenly, the
// drag is refused outright rather than producing a column that's already below the floor.
// No-op when widths are automatic (`null`/`undefined`) — the widget is expected to convert a
// pixel delta into a fraction via `normalizeWidths` before calling this, which needs `widths`
// to already exist to normalize against.
export function resizeColumns(
  m: TableModel,
  border: number,
  delta: number,
  minFraction: number,
): TableModel {
  if (!m.widths) return m;
  const columnCount = m.header.length;
  if (border < 0 || border >= columnCount - 1) return m;

  const widths = m.widths.slice();
  const left = widths[border] ?? 0;
  const right = widths[border + 1] ?? 0;
  const total = left + right;
  if (total < minFraction * 2) return m;

  const newLeft = clamp(left + delta, minFraction, total - minFraction);
  widths[border] = newLeft;
  widths[border + 1] = total - newLeft;
  return { ...m, widths };
}

// [excalisidian] Drop back to automatic (content-based) width. Kept as its own function, rather
// than callers writing `{ ...m, widths: null }` themselves, so "clear the resize" has one name
// to search for.
export function clearWidths(m: TableModel): TableModel {
  return { ...m, widths: null };
}
