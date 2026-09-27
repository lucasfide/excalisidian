import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import {
  EditorSelection,
  Facet,
  Prec,
  StateField,
  Transaction,
  type EditorState,
  type Extension,
  type Range,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  WidgetType,
  keymap,
  type DecorationSet,
} from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import { matchHighlight } from './highlight';
import { treeGrowthEffect, treeProgressPlugin } from './tree-progress';
import { readOnlyFacet } from './read-only';
// [excalisidian] Model, parse and serialize now live in table-model.ts (doc 14 §2.1) so
// alignment (`:---`, `:---:`, `---:`) round-trips instead of being parsed and dropped — see
// that file's header comment. This widget only deals with the syntax tree, the DOM and CM6
// transactions.
import {
  clearWidths,
  insertColumn,
  insertRow,
  moveColumn,
  moveRow,
  normalizeWidths,
  parseTableText,
  resizeColumns,
  serializeTable,
  type ColumnAlign,
  type TableModel,
} from './table-model';

// GFM tables as a WYSIWYG block widget.
//
// Strategy: replace the entire Table node in the source with a block
// Decoration.replace widget. The widget renders an HTML `<table>`
// whose `<th>` / `<td>` cells are `contenteditable`. Editing flows
// DOM → source: on every cell `input` event we re-serialize the
// widget's DOM state to markdown and dispatch a single change that
// replaces the table's current source range. Source → DOM is handled
// by the StateField rebuilding a widget from the parsed tree, but
// crucially our widget's `eq` is structure-only: same row/col count
// returns true, so CM6 keeps the existing DOM across keystrokes and
// the caret / focus survive.
//
// Tab / Shift-Tab move focus between cells. Tab past the last cell
// appends a new row and focuses its first cell. Backspace/Delete
// inside a cell uses browser default (per-char). Outside the widget
// (at the table's atomic boundary), CM6's atomic-range handling
// deletes the whole table as one unit — matching Obsidian's "table
// is a unit" feel.
//
// [excalisidian] The row/column/alignment menu used to be a hand-rolled DOM popup built and
// positioned by this file (`openCellMenu`, upstream). It's replaced by `tableMenuFacet`: this
// file only detects the gesture (right-click on a cell; hover handles land in T2) and builds a
// `TableMenuRequest` describing what was clicked plus callbacks to apply a change or delete the
// table — `src/editor/extensoes/menuTabela.tsx` (project code, not vendored) owns the actual
// menu UI, in the app's `Menu`/`ItemMenu` component and in Portuguese. With no handler
// registered on the facet, right-click is a no-op (no menu at all, not even the browser's).
//
// [excalisidian] Hover "+" strips (grow the table) and row/column drag handles (doc 14 §1.3,
// §2.3 — T2) live in `attachTableControls` below, built inside `.cm-atomic-table-surface`
// (`toDOM`). They're plain DOM + pointer events, same rule as the rest of this file: no React,
// no HTML5 drag-and-drop (fails in the WebView2 host — see `moverBloco.ts`'s header comment).
//
// Scope cuts deliberately left out of v1 (doc 14 tackles the rest across T3-T4):
//   - Rich content inside cells (markdown marks, links, etc.) — already supported.
//   - Table creation from typed markdown / palette / toolbar (T3/T4).

// ---- cell / DOM read helpers ----------------------------------------

function readModelFromDom(wrap: HTMLElement): TableModel {
  const headerCells = Array.from(wrap.querySelectorAll<HTMLElement>('thead th'));
  const header = headerCells.map(readCellSource);
  // [excalisidian] Alignment's source of truth in the DOM is `data-align` on each header
  // cell (§2.2: "por exemplo via data-align nas células/colunas") — the header row always has
  // exactly one cell per column, so its index lines up 1:1 with `TableModel.aligns`. Body cells
  // get the matching `text-align` inline style for rendering (see `makeCell`) but don't need
  // their own `data-align`: they never disagree with their column's header.
  const aligns: ColumnAlign[] = headerCells.map((th) => {
    const raw = th.dataset.align;
    return raw === 'left' || raw === 'center' || raw === 'right' ? raw : null;
  });
  const rows = Array.from(wrap.querySelectorAll<HTMLElement>('tbody tr')).map(
    (tr) => Array.from(tr.querySelectorAll<HTMLElement>('td')).map(readCellSource),
  );
  // [excalisidian] Column widths (doc 14 §1.5) live in `data-width` on each header cell, same
  // pattern as `data-align` above — critical because every menu action and drag gesture reads
  // its base model FROM the DOM via this function, so skipping this would silently drop a
  // resized table's widths the next time any other action ran. `undefined` on ANY header cell
  // (a table that was never resized) means "automatic": `null`, not a partial array.
  const widths: number[] | null = headerCells.every((th) => th.dataset.width !== undefined)
    ? headerCells.map((th) => Number(th.dataset.width))
    : null;
  return { header, aligns, rows, widths };
}

// A cell's raw markdown lives in `dataset.raw` — the source of truth
// that `readModelFromDom` reads when serializing the table back to
// markdown. The inner `.cm-atomic-table-cell-source` element displays
// an escape-stripped view of that raw text so RSS-ingested cells
// don't show `\.` / `\(` / `\-` style literal backslashes in the
// reader; the input handler pulls innerText back to dataset.raw on
// every keystroke (any escapes the user types get preserved there,
// but won't round-trip back through stripEscapes on re-render —
// acceptable tradeoff because the escapes are typically ingestion
// artifacts users don't want to preserve anyway).
function readCellSource(cell: HTMLElement): string {
  return (cell.dataset.raw ?? '').trim();
}

function getCellSource(cell: HTMLElement): HTMLElement | null {
  return cell.querySelector<HTMLElement>('.cm-atomic-table-cell-source');
}

// ---- inline-mark parsing for cell source --------------------------------

// Cells render a subset of inline markdown — bold, italic, strikethrough,
// highlight, and links. No code spans (the `|` inside a backtick would silently
// break row parsing), no lists/blocks (cells are single-line by
// construction), no images (handled by the separate cell-preview strip).
//
// The parser is recursive so `**[text](url)**` nests cleanly, but each
// mark is a straightforward delimiter pair. Highlights share their
// delimiter/flanking rules with the main markdown parser so the same
// source renders consistently inside and outside tables.

type CellToken =
  | { type: 'text'; text: string }
  | { type: 'strong'; delim: '**' | '__'; children: CellToken[] }
  | { type: 'em'; delim: '*' | '_'; children: CellToken[] }
  | { type: 'strike'; children: CellToken[] }
  | { type: 'highlight'; children: CellToken[] }
  | { type: 'link'; textChildren: CellToken[]; url: string };

export function parseCellInline(raw: string): CellToken[] {
  const tokens: CellToken[] = [];
  let textBuf = '';
  let i = 0;

  const flushText = () => {
    if (textBuf.length) {
      tokens.push({ type: 'text', text: textBuf });
      textBuf = '';
    }
  };

  while (i < raw.length) {
    // CommonMark backslash escape — the following char is emitted
    // literally and can't open/close a mark. Pair is consumed.
    if (raw[i] === '\\' && i + 1 < raw.length && /[!-/:-@[-`{-~]/.test(raw[i + 1])) {
      textBuf += raw[i + 1];
      i += 2;
      continue;
    }

    const match = matchCellMarkAt(raw, i);
    if (match) {
      flushText();
      tokens.push(match.token);
      i = match.end;
      continue;
    }

    textBuf += raw[i];
    i++;
  }

  flushText();
  return tokens;
}

function matchCellMarkAt(
  raw: string,
  from: number,
): { token: CellToken; end: number } | null {
  const rest = raw.slice(from);

  // Bold with `**` or `__` — greedy on the outside, lazy on the
  // content so we catch the nearest closer.
  let m = rest.match(/^\*\*([\s\S]+?)\*\*/);
  if (m) {
    return {
      token: { type: 'strong', delim: '**', children: parseCellInline(m[1]) },
      end: from + m[0].length,
    };
  }
  m = rest.match(/^__([\s\S]+?)__/);
  if (m) {
    return {
      token: { type: 'strong', delim: '__', children: parseCellInline(m[1]) },
      end: from + m[0].length,
    };
  }

  // Strikethrough.
  m = rest.match(/^~~([\s\S]+?)~~/);
  if (m) {
    return {
      token: { type: 'strike', children: parseCellInline(m[1]) },
      end: from + m[0].length,
    };
  }

  // Highlight. Keep exact-delimiter and whitespace rules aligned with
  // the main Lezer extension.
  const highlight = matchHighlight(raw, from);
  if (highlight) {
    return {
      token: {
        type: 'highlight',
        children: parseCellInline(
          raw.slice(highlight.contentFrom, highlight.contentTo),
        ),
      },
      end: highlight.end,
    };
  }

  // Link `[text](url)`. Reject empty text / url via `+` quantifiers.
  // `]` and `)` can't appear unescaped inside their respective fields.
  m = rest.match(/^\[([^\]\n]+)\]\(([^\s)"'\n]+)\)/);
  if (m) {
    return {
      token: {
        type: 'link',
        textChildren: parseCellInline(m[1]),
        url: m[2],
      },
      end: from + m[0].length,
    };
  }

  // Italic with `*`. Reject a leading `*` (that would have matched
  // the bold regex above; this guards against pathological inputs
  // like `***` that slip through).
  m = rest.match(/^\*([^*\n]+?)\*/);
  if (m) {
    return {
      token: { type: 'em', delim: '*', children: parseCellInline(m[1]) },
      end: from + m[0].length,
    };
  }

  // Italic with `_`. Avoid triggering inside words like `snake_case`
  // by requiring the char before `_` to not be a word character.
  // (Fallback to true when `_` is at start-of-input.)
  const prev = from > 0 ? raw[from - 1] : '';
  if (!/\w/.test(prev)) {
    m = rest.match(/^_([^_\n]+?)_/);
    if (m) {
      return {
        token: { type: 'em', delim: '_', children: parseCellInline(m[1]) },
        end: from + m[0].length,
      };
    }
  }

  return null;
}

// Build the decorated DOM for a cell's source. The parser strips
// CommonMark backslash escapes inline (so `\*` emits a literal `*`
// text node); the fragment's `textContent` equals the escape-stripped
// raw. The cell's input handler reads `textContent` to update
// `dataset.raw` — round-trip is one-way for escapes (same as the
// pre-markdown-in-cells behavior), but fully preserves every inline
// mark delimiter because those live in `display: none` spans inside
// the DOM rather than being derived on serialize.
function buildCellSourceDom(raw: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  const tokens = parseCellInline(raw);
  for (const tok of tokens) frag.appendChild(renderCellToken(tok));
  return frag;
}

function renderCellToken(tok: CellToken): Node {
  if (tok.type === 'text') {
    return document.createTextNode(tok.text);
  }

  if (tok.type === 'strong') {
    const wrap = document.createElement('span');
    wrap.className = 'cm-atomic-strong-wrap';
    wrap.appendChild(makeCellMark(tok.delim));
    const inner = document.createElement('span');
    inner.className = 'cm-atomic-strong';
    inner.appendChild(renderTokensTo(tok.children));
    wrap.appendChild(inner);
    wrap.appendChild(makeCellMark(tok.delim));
    return wrap;
  }

  if (tok.type === 'em') {
    const wrap = document.createElement('span');
    wrap.className = 'cm-atomic-em-wrap';
    wrap.appendChild(makeCellMark(tok.delim));
    const inner = document.createElement('span');
    inner.className = 'cm-atomic-em';
    inner.appendChild(renderTokensTo(tok.children));
    wrap.appendChild(inner);
    wrap.appendChild(makeCellMark(tok.delim));
    return wrap;
  }

  if (tok.type === 'strike') {
    const wrap = document.createElement('span');
    wrap.className = 'cm-atomic-strike-wrap';
    wrap.appendChild(makeCellMark('~~'));
    const inner = document.createElement('span');
    inner.className = 'cm-atomic-strike';
    inner.appendChild(renderTokensTo(tok.children));
    wrap.appendChild(inner);
    wrap.appendChild(makeCellMark('~~'));
    return wrap;
  }

  if (tok.type === 'highlight') {
    const wrap = document.createElement('span');
    wrap.className = 'cm-atomic-highlight-wrap';
    wrap.appendChild(makeCellMark('=='));
    const inner = document.createElement('span');
    inner.className = 'cm-atomic-highlight';
    inner.appendChild(renderTokensTo(tok.children));
    wrap.appendChild(inner);
    wrap.appendChild(makeCellMark('=='));
    return wrap;
  }

  // Link. Shape mirrors the outer-editor markup: `.cm-atomic-link` on
  // the visible text (picks up link color + external-link icon via
  // `::after`), faint marks for `[`, `]`, `(`, URL, `)`, and highlight
  // uses the same decorated wrapper pattern as the main editor.
  // `data-url`
  // lets the cell-source click handler open the right URL without
  // re-parsing.
  const wrap = document.createElement('span');
  wrap.className = 'cm-atomic-link-wrap';
  wrap.dataset.url = tok.url;
  wrap.appendChild(makeCellMark('['));
  const inner = document.createElement('span');
  inner.className = 'cm-atomic-link';
  inner.appendChild(renderTokensTo(tok.textChildren));
  wrap.appendChild(inner);
  wrap.appendChild(makeCellMark(']'));
  wrap.appendChild(makeCellMark('('));
  const urlMark = makeCellMark(tok.url);
  urlMark.classList.add('cm-atomic-link-url');
  wrap.appendChild(urlMark);
  wrap.appendChild(makeCellMark(')'));
  // Real, clickable external-link icon. A CSS `::after` pseudo can't
  // receive a click (no event target), so the icon is its own
  // non-editable element; the source's delegated click handler opens
  // the URL. `contenteditable=false` keeps it out of caret navigation
  // and out of the cell's serialized text.
  const icon = document.createElement('span');
  icon.className = 'cm-atomic-link-icon';
  icon.contentEditable = 'false';
  icon.setAttribute('aria-hidden', 'true');
  wrap.appendChild(icon);
  return wrap;
}

function renderTokensTo(tokens: CellToken[]): DocumentFragment {
  const frag = document.createDocumentFragment();
  for (const tok of tokens) frag.appendChild(renderCellToken(tok));
  return frag;
}

function makeCellMark(text: string): HTMLElement {
  const el = document.createElement('span');
  el.className = 'cm-atomic-mark';
  el.textContent = text;
  return el;
}

// Render a cell source element in its decorated form. Safe to call
// multiple times — overwrites whatever was there.
//
// Marks start collapsed: all `.cm-atomic-mark` descendants (delimiters
// like `**`, `_`, `~~`, `[`, `]`, `(`, `)`, and URL text) are hidden
// via CSS by default. When the caret enters a mark wrap, JS adds an
// `active` class that reveals that wrap's delimiters — mirroring the
// outer editor's cursor-inside-link unfold for every inline mark.
function renderCellSourceDecorated(source: HTMLElement): void {
  const raw = source.parentElement?.dataset.raw ?? '';
  source.replaceChildren(buildCellSourceDom(raw));
}

// Caret utilities — encode positions as character offsets within the
// element's textContent so we can survive the full-DOM re-render that
// follows every keystroke (new marks need to decorate immediately;
// the whole tree rebuilds from scratch).

function getCaretCharOffset(container: HTMLElement): number | null {
  const selection = container.ownerDocument?.defaultView?.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!container.contains(range.startContainer)) return null;
  const pre = range.cloneRange();
  pre.selectNodeContents(container);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}

function setCaretCharOffset(container: HTMLElement, offset: number): void {
  const doc = container.ownerDocument;
  if (!doc) return;
  const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let target: Text | null = null;
  let targetOffset = 0;
  let node = walker.nextNode() as Text | null;
  while (node) {
    const len = node.data.length;
    if (remaining <= len) {
      target = node;
      targetOffset = remaining;
      break;
    }
    remaining -= len;
    node = walker.nextNode() as Text | null;
  }
  const selection = doc.defaultView?.getSelection();
  if (!selection) return;
  const range = doc.createRange();
  if (target) {
    range.setStart(target, targetOffset);
  } else {
    // Offset past the end — place caret at the container's end.
    range.selectNodeContents(container);
    range.collapse(false);
  }
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

// Select every character of `container` — used by `focusTableCell`'s
// `selectAll` option (§1.1: inserting a table selects "Coluna 1" so
// typing replaces it outright).
function selectAllInSource(source: HTMLElement): void {
  const doc = source.ownerDocument;
  const selection = doc?.defaultView?.getSelection();
  if (!doc || !selection) return;
  const range = doc.createRange();
  range.selectNodeContents(source);
  selection.removeAllRanges();
  selection.addRange(range);
}

const MARK_WRAP_CLASSES = [
  'cm-atomic-strong-wrap',
  'cm-atomic-em-wrap',
  'cm-atomic-strike-wrap',
  'cm-atomic-link-wrap',
];

function isMarkWrap(el: Element): boolean {
  for (const c of MARK_WRAP_CLASSES) if (el.classList.contains(c)) return true;
  return false;
}

// Reveal the delimiters of whatever mark wrap(s) contain the caret,
// and collapse every other wrap in this cell. Walks from the caret
// anchor up to the source element, flagging every ancestor mark wrap
// so nested marks (bold-containing-italic) all reveal together — the
// user sees the full structure around their caret.
function updateActiveMarkForSource(source: HTMLElement): void {
  // Clear existing `active` classes within this cell only — other
  // cells track their own state via their own focus lifecycle.
  for (const el of source.querySelectorAll('.active')) {
    el.classList.remove('active');
  }

  const doc = source.ownerDocument;
  if (!doc) return;
  const selection = doc.defaultView?.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const anchor = selection.anchorNode;
  if (!anchor || !source.contains(anchor)) return;

  let node: Node | null = anchor;
  while (node && node !== source) {
    if (node instanceof Element && isMarkWrap(node)) {
      node.classList.add('active');
    }
    node = node.parentNode;
  }
}

function clearActiveMarksInSource(source: HTMLElement): void {
  for (const el of source.querySelectorAll('.active')) {
    el.classList.remove('active');
  }
}

interface CellImage {
  src: string;
  alt: string;
}

// Scan raw markdown for `![alt](url)` occurrences. The regex bans `]`
// inside the alt and whitespace inside the URL so we fail closed on
// malformed sources rather than embedding a broken preview.
function extractCellImages(text: string): CellImage[] {
  const imgs: CellImage[] = [];
  const re = /!\[([^\]]*)\]\(([^\s)"']+)(?:\s+["'][^)]*["'])?\)/g;
  for (const match of text.matchAll(re)) {
    imgs.push({ alt: match[1] || '', src: match[2] });
  }
  return imgs;
}

// Refresh (or remove) the image-preview strip that sits below the
// source line. Mirrors how images render outside tables: the
// `![alt](url)` markdown is the source of truth, but on an inactive
// cell (no focus inside) the raw source hides and only the rendered
// image remains visible. `data-has-image` flips on for that CSS hook.
function refreshCellPreview(cell: HTMLElement): void {
  const existing = cell.querySelector<HTMLElement>('.cm-atomic-table-cell-preview');
  if (existing) existing.remove();

  const text = cell.dataset.raw ?? '';
  const imgs = extractCellImages(text);
  if (imgs.length === 0) {
    delete cell.dataset.hasImage;
    return;
  }
  cell.dataset.hasImage = 'true';

  const preview = document.createElement('div');
  preview.className = 'cm-atomic-table-cell-preview';
  // Preview is visual only — no caret, no contenteditable scope.
  // Keeping it out of contenteditable also means clicking the image
  // won't create a phantom caret position at the preview boundary.
  preview.contentEditable = 'false';

  for (const { src, alt } of imgs) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = alt;
    img.loading = 'lazy';
    img.className = 'cm-atomic-table-cell-image';
    // Clicking the image puts the caret in the source text so the
    // user can edit the underlying markdown — same affordance as
    // clicking a block-level image outside a table.
    img.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const source = getCellSource(cell);
      if (!source) return;
      source.focus();
      placeCaretAtEnd(source);
    });
    preview.appendChild(img);
  }

  cell.appendChild(preview);
}

// ---- position resolution --------------------------------------------

// posAtDOM on a block-replace widget returns the start of the replaced
// range. Walk the tree from there to find the enclosing Table node so
// our dispatch targets the current range (positions shift as the user
// types — we can't rely on the from/to captured at widget creation).
function findCurrentTableRange(
  view: EditorView,
  dom: HTMLElement,
): { from: number; to: number } | null {
  const pos = view.posAtDOM(dom);
  if (pos < 0) return null;
  const tree = syntaxTree(view.state);
  let node: SyntaxNode | null = tree.resolveInner(pos, 1);
  while (node && node.name !== 'Table') node = node.parent;
  if (node) return { from: node.from, to: node.to };

  // Fallback: scan for the nearest Table node containing or starting
  // at pos. Rare — resolveInner + parent walk handles almost every
  // case — but guards against parser edge cases.
  let found: SyntaxNode | null = null;
  tree.iterate({
    enter: (n) => {
      if (n.name !== 'Table') return;
      if (n.from <= pos && n.to >= pos) {
        found = n.node;
        return false;
      }
    },
  });
  if (found) return { from: (found as SyntaxNode).from, to: (found as SyntaxNode).to };
  return null;
}

// Find the currently-rendered widget DOM for the table starting at
// `tableFrom`, by position — mirrors the lookup `appendRow` already
// used. Positions, not object identity, because a structural edit
// (row/column count change) makes CM6 rebuild the widget's DOM: the
// old `HTMLElement` reference a caller might be holding is detached.
function findTableWrapAt(view: EditorView, tableFrom: number): HTMLElement | null {
  const tables = view.dom.querySelectorAll<HTMLElement>('.cm-atomic-table');
  for (const el of tables) {
    try {
      if (view.posAtDOM(el) === tableFrom) return el;
    } catch {
      // posAtDOM can throw on detached/transitional DOM nodes — skip.
    }
  }
  return null;
}

function getCellAt(wrap: HTMLElement, row: number, col: number): HTMLElement | null {
  if (row < 0) {
    const ths = wrap.querySelectorAll<HTMLElement>('thead th');
    return ths[col] ?? null;
  }
  const trs = wrap.querySelectorAll<HTMLElement>('tbody tr');
  const tr = trs[row];
  if (!tr) return null;
  const tds = tr.querySelectorAll<HTMLElement>('td');
  return tds[col] ?? null;
}

// [excalisidian] Focus a table cell by (row, col) — row -1 is the header — after a model change
// has been dispatched. Exported per doc 14 §2.2 for T2 (drag/hover controls) and T3 (table
// creation) to reuse.
//
// Why polling with `requestAnimationFrame` instead of `view.requestMeasure`: a structural
// change (row/column count differs) makes `TableWidget.eq` return false, so CM6 throws away the
// old widget DOM and calls `toDOM` again — but that rebuild happens as part of the *view
// update* CM6 runs after `dispatch`, which for a caller one tick removed from the dispatch (a
// menu item's `onClick`, a keymap command) can still observe the pre-rebuild DOM depending on
// exactly when CM6 flushes it. `requestMeasure` schedules work for CM6's own next measure
// pass and doesn't hand back a "yes, definitely done" signal a plain caller can await; polling
// on animation frames (the same pattern `appendRow` already relied on before this file existed)
// just keeps trying until the new DOM is actually there, capped at a couple of frames so a
// genuinely missing table (deleted, or the request was stale) gives up instead of looping.
export function focusTableCell(
  view: EditorView,
  tableFrom: number,
  row: number,
  col: number,
  opts?: { selectAll?: boolean },
): void {
  const attempt = (retriesLeft: number): void => {
    const wrap = findTableWrapAt(view, tableFrom);
    const cell = wrap ? getCellAt(wrap, row, col) : null;
    const source = cell ? getCellSource(cell) : null;
    if (source) {
      source.focus();
      if (opts?.selectAll) selectAllInSource(source);
      else placeCaretAtEnd(source);
      return;
    }
    if (retriesLeft <= 0) return;
    requestAnimationFrame(() => attempt(retriesLeft - 1));
  };
  attempt(2);
}

// ---- DOM helpers ----------------------------------------------------

function placeCaretAtEnd(el: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(range);
}

function getAllCells(wrap: HTMLElement): HTMLElement[] {
  return Array.from(wrap.querySelectorAll<HTMLElement>('th, td'));
}

// [excalisidian] `widths` equality with `null`/`undefined` treated as the same "automatic"
// state — plain `===` on the two arrays would always be false (different array instances) and
// comparing by reference would defeat the point of an `eq` check.
function widthsEqual(a: number[] | null | undefined, b: number[] | null | undefined): boolean {
  const an = a ?? null;
  const bn = b ?? null;
  if (an === null || bn === null) return an === bn;
  if (an.length !== bn.length) return false;
  for (let i = 0; i < an.length; i++) if (an[i] !== bn[i]) return false;
  return true;
}

// ---- widget ---------------------------------------------------------

class TableWidget extends WidgetType {
  constructor(readonly model: TableModel, readonly readOnly: boolean) {
    super();
  }

  // Structure-only equality. Typing in a cell produces a new
  // TableWidget with the same dimensions but different cell contents.
  // Returning true here means CM6 keeps the existing DOM instead of
  // calling `toDOM` again — which is what lets the caret survive
  // across the per-keystroke dispatch cycle.
  //
  // `readOnly` is part of the identity: cells are built editable or
  // inert at `toDOM` time, so a reading-mode toggle must force a fresh
  // DOM rather than reusing the stale (editable) one.
  //
  // [excalisidian] Content is now part of the identity, not just shape. Upstream only compared
  // row/column counts (+ our earlier alignment-array addition) on the theory that any content
  // change is a per-keystroke `input` edit, which mutates the live DOM directly and then
  // dispatches — so the freshly-parsed model always matches what's already on screen, and
  // reusing the old DOM (skip `toDOM`, caret survives) was safe.
  //
  // That theory breaks for a REORDER: `moveRow`/`moveColumn` (doc 14 §1.3 drag, and the
  // pre-existing "Mover linha/coluna" menu items that share this codepath) build the next
  // model in memory and dispatch its serialized text WITHOUT first touching the DOM. Row/column
  // counts and aligns are unchanged, so the old structure-only `eq` returned `true` and CM6 kept
  // the stale, pre-move DOM — the table would silently un-reorder itself back to the old order
  // the moment any cell was next edited (`dispatchModelFromDom` reads the model FROM that stale
  // DOM). Comparing header/row text as well fixes this. It also makes `eq` return `false` while
  // typing (the previous widget holds the pre-keystroke text) — `updateDOM` below is what keeps
  // the DOM, and the caret, in that case. `apply()`
  // callers that reorder already pass an explicit `focus` target (see `menuTabela.tsx`) for
  // exactly this reason: they expect a rebuild.
  eq(other: TableWidget): boolean {
    if (other.readOnly !== this.readOnly) return false;
    if (other.model.header.length !== this.model.header.length) return false;
    if (other.model.rows.length !== this.model.rows.length) return false;
    // [excalisidian] Widths are part of the widget's identity too (doc 14 §1.5) — same reasoning
    // as the header/row text comparison below: a resize dispatches its serialized model without
    // touching the DOM first (the live drag already showed the change; the dispatch is just
    // persistence), so without this a structure-only `eq` would keep the DOM at its pre-resize
    // widths until the next unrelated edit forced a rebuild.
    if (!widthsEqual(this.model.widths, other.model.widths)) return false;
    for (let i = 0; i < this.model.aligns.length; i++) {
      if (other.model.aligns[i] !== this.model.aligns[i]) return false;
    }
    for (let i = 0; i < this.model.header.length; i++) {
      if (other.model.header[i] !== this.model.header[i]) return false;
    }
    for (let r = 0; r < this.model.rows.length; r++) {
      const a = this.model.rows[r];
      const b = other.model.rows[r];
      for (let c = 0; c < a.length; c++) {
        if (a[c] !== b[c]) return false;
      }
    }
    return true;
  }

  // [excalisidian] `eq` compares this widget with the PREVIOUS widget, not with the DOM on
  // screen — so while typing (previous model "ab", new model "abc") it returns `false` too, and
  // without this method CM6 would rebuild the table on every keystroke, dropping the caret out
  // of the cell. CM6 calls `updateDOM` before rebuilding: when the live DOM already shows this
  // model (the typing case — the cell's input handler mutated the DOM before dispatching), keep
  // it. A reorder/menu action dispatches without touching the DOM, so the DOM still shows the
  // old model, this returns `false`, and CM6 rebuilds. Compared through `serializeTable` so
  // escaping (`|` vs `\|`) doesn't count as a difference. Controls and cell handlers read the
  // model from the DOM at action time, so reusing the DOM leaves nothing stale.
  updateDOM(dom: HTMLElement, _view: EditorView, from: TableWidget): boolean {
    if (from.readOnly !== this.readOnly) return false;
    return serializeTable(readModelFromDom(dom)) === serializeTable(this.model);
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'cm-atomic-table';

    const table = buildTableElement(this.model, view);

    // [excalisidian] Read-only: just the table, no hover controls at all (doc 14 §1.3 "não
    // aparecem na vista somente leitura") — cheaper than building them and hiding by CSS, and
    // impossible to accidentally reveal since they never enter the DOM.
    if (this.readOnly) {
      wrap.appendChild(table);
      return wrap;
    }

    // [excalisidian] `.cm-atomic-table-surface` is the positioned ancestor for every hover
    // control (`position: relative`) and reserves their space with PERMANENT padding — see the
    // long comment on that class in `styles/inline-preview.css` for why the padding can never
    // toggle with hover (CM6 heightmap desync, same failure mode as the margin-vs-padding bug
    // this file's header already documents for the table's own vertical rhythm).
    const surface = document.createElement('div');
    surface.className = 'cm-atomic-table-surface';
    surface.appendChild(table);
    wrap.appendChild(surface);

    attachTableControls(view, wrap, surface, table);

    return wrap;
  }

  // All cell interactions are handled by the listeners we attach in
  // `makeCell`; tell CM6 to stay out of events within the widget so
  // its own selection/click logic doesn't compete with contenteditable.
  ignoreEvent(): boolean {
    return true;
  }
}

// [excalisidian] Split out of `TableWidget.toDOM` so read-only mode (no surface, no controls)
// and edit mode (surface + controls wrapping this same table) can share it verbatim.
function buildTableElement(model: TableModel, view: EditorView): HTMLTableElement {
  const table = document.createElement('table');

  // [excalisidian] Column widths (doc 14 §1.5): a `<colgroup>` with one `<col>` per column,
  // width in percent, plus `cm-atomic-table-fixed` to switch the table from content-sized
  // (`width: max-content`) to `table-layout: fixed` — see `inline-preview.css`. `null`/
  // `undefined` widths (never resized, or reset via "Largura automática") skip this entirely
  // and the table falls back to its original automatic sizing.
  if (model.widths) {
    table.appendChild(buildColgroup(model.widths));
    table.classList.add('cm-atomic-table-fixed');
  }

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (let c = 0; c < model.header.length; c++) {
    headerRow.appendChild(
      makeCell('th', model.header[c], model.aligns[c] ?? null, model.widths?.[c] ?? null, view),
    );
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  const colCount = model.header.length;
  for (const row of model.rows) {
    const tr = document.createElement('tr');
    for (let c = 0; c < colCount; c++) {
      tr.appendChild(makeCell('td', row[c] ?? '', model.aligns[c] ?? null, null, view));
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  return table;
}

// [excalisidian] Builds the `<colgroup>` for a table with stored widths (doc 14 §1.5). Shared by
// `buildTableElement` (source → DOM) and the resize drag's live conversion of an automatic table
// to a fixed one (`applyFixedDomWidths` below) so both paths produce identical markup.
function buildColgroup(widths: number[]): HTMLTableColElement {
  const colgroup = document.createElement('colgroup');
  for (const w of widths) {
    const col = document.createElement('col');
    col.style.width = `${w * 100}%`;
    colgroup.appendChild(col);
  }
  return colgroup;
}

function makeCell(
  tag: 'th' | 'td',
  text: string,
  align: ColumnAlign,
  width: number | null,
  view: EditorView,
): HTMLElement {
  const cell = document.createElement(tag);
  cell.dataset.raw = text;
  // [excalisidian] Column alignment (doc 14 §1.4). `text-align` renders it for every cell in
  // the column; `data-align` is stored only on the header cell — `readModelFromDom` reads the
  // column's alignment back from there (see that function's comment).
  cell.style.textAlign = align ?? 'left';
  if (tag === 'th') {
    cell.dataset.align = align ?? '';
    // [excalisidian] Column width (doc 14 §1.5), same "only on the header cell" pattern as
    // `data-align` — `readModelFromDom` reads it back from there.
    if (width != null) cell.dataset.width = String(width);
  }

  // The cell itself is not contenteditable — only the inner source
  // element is. This keeps the image preview strictly visual (no
  // phantom caret positions around images) while the source text
  // stays in a dedicated editable box above it.
  const readOnly = view.state.facet(readOnlyFacet);
  const source = document.createElement('div');
  source.className = 'cm-atomic-table-cell-source';
  // Read-only cells still show their decorated source but accept no
  // edits — the editing listeners below are skipped entirely.
  source.contentEditable = readOnly ? 'false' : 'true';
  source.spellcheck = !readOnly;
  // Decorated DOM on mount. Delimiters (`.cm-atomic-mark`) are
  // `display: none` by default — the caret can't navigate into them,
  // the reader sees a clean rendered view. When the caret enters a
  // mark wrap, JS adds `.active` to reveal that wrap's delimiters —
  // matching the outer-editor cursor-inside-link unfold, applied
  // uniformly to every inline mark inside cells.
  cell.appendChild(source);
  renderCellSourceDecorated(source);

  // All write paths (typing, paste, IME, Tab/Enter navigation, the
  // context menu, focus-routing) live in `attachCellEditing` and are
  // wired only when the cell is editable. Read-only cells keep just the
  // link-open handlers below.
  if (!readOnly) attachCellEditing(view, cell, source);

  // Link open. The external-link icon is rendered as a real
  // `.cm-atomic-link-icon` element (see `renderCellToken`), not a CSS
  // `::after` pseudo — a pseudo-element has no event target, so clicking
  // its painted region dispatched no pointer event and the link never
  // opened. We open on `click` (a proper popup-activation gesture, so
  // `window.open` isn't blocked) and block the caret on `pointerdown`.
  //
  // In read-only mode there's no editable link text to protect, so the
  // whole link (`.cm-atomic-link-wrap`) is the open target — matching
  // the outer editor. In edit mode the open stays scoped to the
  // trailing icon so the text itself remains clickable-to-edit.
  const openTargetFromEvent = (event: Event): HTMLElement | null => {
    const target = event.target;
    if (!(target instanceof Element)) return null;
    const selector = readOnly ? '.cm-atomic-link-wrap' : '.cm-atomic-link-icon';
    return target.closest<HTMLElement>(selector);
  };

  source.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    // Block focus / caret placement when pressing the open target; the
    // open happens on the following `click`.
    if (openTargetFromEvent(event)) event.preventDefault();
  });

  source.addEventListener('click', (event) => {
    const hit = openTargetFromEvent(event);
    if (!hit) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const url = hit.closest<HTMLElement>('.cm-atomic-link-wrap')?.dataset.url;
    if (!url) return;
    event.preventDefault();
    event.stopPropagation();
    view.state.facet(tableLinkClickFacet)(url);
  });

  refreshCellPreview(cell);

  return cell;
}

// Wire every write path for an editable cell: typing / paste / IME
// commits, caret-driven mark reveal, Tab/Enter cell navigation, the
// right-click context menu, and focus-routing for clicks that land
// outside the inner source element. Skipped wholesale for read-only
// cells, which keep only the link-open handlers in `makeCell`.
function attachCellEditing(
  view: EditorView,
  cell: HTMLElement,
  source: HTMLElement,
): void {
  // Commit the cell's current DOM text to `dataset.raw`, re-render its
  // decorated form (so marks the user just typed — e.g. a new `**` pair
  // — decorate immediately), restore the caret across that rebuild, and
  // push the change into the document.
  const commit = () => {
    // textContent (not innerText) so `display: none` delimiters inside
    // mark wraps are still captured — otherwise a cell containing
    // `**bold**` would serialize to just `bold` on every keystroke.
    const raw = (source.textContent ?? '').replace(/\s+/g, ' ').trim();
    cell.dataset.raw = raw;
    const offset = getCaretCharOffset(source);
    renderCellSourceDecorated(source);
    if (offset != null) setCaretCharOffset(source, offset);
    updateActiveMarkForSource(source);
    refreshCellPreview(cell);
    dispatchModelFromDom(view, cell);
  };

  // IME / dead-key composition. `commit` rebuilds the contenteditable
  // DOM, and doing that mid-composition cancels the composition session
  // — dropping CJK input, accented characters, and dictation. Suppress
  // every update while composing and run one commit when it ends.
  let composing = false;
  source.addEventListener('compositionstart', () => {
    composing = true;
  });
  source.addEventListener('compositionend', () => {
    composing = false;
    commit();
  });

  source.addEventListener('input', (event) => {
    if (composing || (event as InputEvent).isComposing) return;
    commit();
  });

  // Paste: drop clipboard content in as a single line of plain text.
  // Without this, pasted rich HTML, newlines, or pipes land in the cell
  // verbatim; newlines and `|` corrupt the row. We flatten whitespace
  // and strip markup here, and `escapeCell` neutralizes any literal `|`
  // on serialize.
  source.addEventListener('paste', (event) => {
    event.preventDefault();
    const text = (event.clipboardData?.getData('text/plain') ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    const sel = source.ownerDocument.defaultView?.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(text));
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    commit();
  });

  // Caret-position listeners. `focus` / `mouseup` / `keyup` cover the
  // three ways the caret can land in a new mark without firing an
  // input event (click-to-place, arrow-key nav, tab-into-cell). The
  // update is idempotent — redundant calls cost nothing.
  source.addEventListener('focus', () => updateActiveMarkForSource(source));
  source.addEventListener('mouseup', () => updateActiveMarkForSource(source));
  source.addEventListener('keyup', () => updateActiveMarkForSource(source));

  // Blur: collapse every active wrap so the reader-resting state
  // hides all delimiters.
  source.addEventListener('blur', () => clearActiveMarksInSource(source));

  source.addEventListener('keydown', (event) => {
    // Enter mirrors Tab — advance to the next cell (appending a row past
    // the last one) instead of inserting a line break a single-line cell
    // can't represent. Shift reverses direction for both.
    if (event.key === 'Tab' || event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      moveCellFocus(view, cell, event.shiftKey ? -1 : 1);
    }
  });

  cell.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    event.stopPropagation();
    requestTableMenu(view, cell, event.clientX, event.clientY);
  });

  // When the cell has an image and the source is visually hidden,
  // clicks land on the cell/image/empty space but not on the source
  // itself. Route every pointerdown inside the cell to a focus on
  // the source so the user can edit regardless of where they tapped.
  // The image's own pointerdown handler already does this, but
  // covers only image hits — this covers empty padding and the
  // space between/around images.
  cell.addEventListener('pointerdown', (event) => {
    // A click on the editable source — including its inner mark spans
    // and text — must keep the browser's native caret placement. Forcing
    // focus-at-end here would yank the caret to the end of the cell
    // whenever the user clicks a styled run (bold/italic/link). Only
    // intercept clicks that land OUTSIDE the source (cell padding, the
    // image preview, the cell box itself) to route focus into it.
    const target = event.target;
    if (target instanceof Node && source.contains(target)) return;
    event.preventDefault();
    source.focus();
    placeCaretAtEnd(source);
  });
}

// ---- hover controls (doc 14 §1.3, §2.3): "+" strips, row/column drag handles -----------------

// [excalisidian] Text for the "+" strips and the drag handles' `title`/`aria-label` (doc 14
// §2.3 — the vendored code carries no Portuguese; `menuTabela.tsx` supplies the pt-BR strings
// from doc 14 §3 via this facet). English defaults keep this file self-consistent if `tables()`
// is ever used standalone, matching every other facet default in this module (see
// `tableLinkClickFacet`, `readOnlyFacet`).
export interface TableLabels {
  addColumn: string;
  addRow: string;
  rowHandle: string;
  columnHandle: string;
  resizeHandle: string;
}

const defaultTableLabels: TableLabels = {
  addColumn: 'Add column',
  addRow: 'Add row',
  rowHandle: 'Drag to move the row. Click for more options.',
  columnHandle: 'Drag to move the column. Click for more options.',
  resizeHandle: 'Drag to resize. Double-click for automatic width.',
};

export const tableLabelsFacet = Facet.define<TableLabels, TableLabels>({
  combine: (values) => (values.length ? values[values.length - 1] : defaultTableLabels),
});

// [excalisidian] Icon markup for the "+" strips (`plus`) and drag handles (`grip-vertical`,
// `grip-horizontal` — doc 14 §1.3). This file has no React (plain DOM, see the file's top
// comment) so it can't render `lucide-react` components the way the rest of the app does via
// `BotaoIcone`; pulling React plus a component tree into a vendored, framework-agnostic file to
// paint three static icons would also be a new runtime dependency for a package that currently
// has none. Instead this is the exact path/circle data lucide-react 1.35.0 ships for
// `plus`/`grip-vertical`/`grip-horizontal` (`node_modules/lucide-react/dist/esm/icons/*.mjs`),
// copied in by hand as static SVG markup. `stroke-width="1.5"` matches `BotaoIcone`'s weight
// (lucide's own default is 2) so these read as the same icon family as the rest of the app.
const ICON_PLUS =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" ' +
  'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M5 12h14"/><path d="M12 5v14"/></svg>';

const ICON_GRIP_VERTICAL =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" ' +
  'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/>' +
  '<circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>';

const ICON_GRIP_HORIZONTAL =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" ' +
  'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<circle cx="12" cy="9" r="1"/><circle cx="19" cy="9" r="1"/><circle cx="5" cy="9" r="1"/>' +
  '<circle cx="12" cy="15" r="1"/><circle cx="19" cy="15" r="1"/><circle cx="5" cy="15" r="1"/></svg>';

// [excalisidian] Nearest boundary to `pos` among `boundaries` (index 0 = the gap before the
// first item, index `boundaries.length - 1` = the gap after the last) — i.e. which drop "gap" a
// pointer position resolves to. Pure and DOM-free on purpose (doc 14 §2.3 asks for exactly this
// kind of pure function to be tested — see `table-widget.test.ts`): the geometry (screen-space
// row/column edges) is gathered by the caller; this only picks the closest one. Same shape of
// problem as `gapMaisProximo` in `moverBloco.ts`, kept as a separate copy because that one is a
// private method tied to CodeMirror block geometry and this one only knows about numbers.
export function nearestGapIndex(boundaries: readonly number[], pos: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < boundaries.length; i++) {
    const dist = Math.abs(boundaries[i] - pos);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

// A gap resolves to a no-op move when it's the item's current position or immediately after it
// (dropping right back where it started) — same rule as `moverBloco.ts`'s `calcularMovimento`.
// Exported alongside `nearestGapIndex` so the pure "where does this drop land" logic is fully
// covered by `table-widget.test.ts` without needing a DOM.
export function isNoopGap(origin: number, gap: number): boolean {
  return gap === origin || gap === origin + 1;
}

// Convert a "gap" (0..N, a slot before removal) into the index `moveRow`/`moveColumn` expect (a
// position in the array AFTER the moved item is removed) — same arithmetic as `moverBloco.ts`'s
// `calcularMovimento`.
export function gapToMoveTarget(origin: number, gap: number): number {
  return gap > origin ? gap - 1 : gap;
}

const DRAG_THRESHOLD_PX = 4; // same threshold `moverBloco.ts` uses to tell a click from a drag
// How far outside the table a pointer may stray and still count as "still over the table" (doc
// 14 §1.3 "soltar fora cancela" — a release further than this away is "outside").
const DROP_SLACK_PX = 24;

// [excalisidian] Column-resize constants (doc 14 §1.5). `RESIZE_HOVER_RANGE_PX` is how close the
// pointer must be to an internal column border for the resize handle to appear — the same 4px
// figure the doc gives for the hit zone's tolerance. `MIN_COLUMN_WIDTH_PX` is the product's
// stated floor for a single column.
const RESIZE_HOVER_RANGE_PX = 4;
const MIN_COLUMN_WIDTH_PX = 64;

// [excalisidian] Given the screen-space X positions of every INTERNAL column border (length =
// column count - 1; never the table's outer edges — those aren't resize targets, doc 14 §1.5),
// which one (if any) is within `thresholdPx` of `pos`. Pure and DOM-free like `nearestGapIndex`
// above, for the same reason: the geometry is gathered by the caller from `getBoundingClientRect`,
// this only picks the closest border and decides if it's close enough. `null` means "no border is
// close enough — hide the handle."
export function nearestResizeBorder(
  borders: readonly number[],
  pos: number,
  thresholdPx: number,
): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  for (let i = 0; i < borders.length; i++) {
    const dist = Math.abs(borders[i] - pos);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  if (best === null || bestDist > thresholdPx) return null;
  return best;
}

interface HandleDragConfig {
  /** Screen-space (clientX/clientY) boundary positions, N+1 of them for N items. */
  boundaries: number[];
  origin: number;
  draggedCells: HTMLElement[];
  /** Reads the pointer's coordinate along the drag axis from a PointerEvent. */
  axisCoord: (event: PointerEvent) => number;
  /** Renders (or hides, on `null`) the drop indicator at this gap. */
  showIndicator: (gap: number | null) => void;
  /** Applies the committed move to `targetIndex` (already converted via `gapToMoveTarget`). */
  commit: (targetIndex: number) => void;
  /** No-drag click (pointer never moved past the threshold): open the row/column menu. */
  openMenu: (event: PointerEvent) => void;
}

// [excalisidian] Shared pointer lifecycle for both drag handles (doc 14 §1.3): a few px of
// movement distinguishes "click → menu" from "drag → reorder" (`DRAG_THRESHOLD_PX`); `Esc` and
// releasing while the pointer has strayed too far from the table (`gap === null`) both cancel
// without dispatching anything. Pointer events only — never HTML5 drag-and-drop, which fails in
// the WebView2 host (see `moverBloco.ts`'s header comment; this project has hit that twice).
function runHandleDrag(startEvent: PointerEvent, cfg: HandleDragConfig): void {
  const startCoord = cfg.axisCoord(startEvent);
  let engaged = false;
  let gap: number | null = null;

  const min = cfg.boundaries[0] - DROP_SLACK_PX;
  const max = cfg.boundaries[cfg.boundaries.length - 1] + DROP_SLACK_PX;

  const onMove = (event: PointerEvent) => {
    const coord = cfg.axisCoord(event);
    if (!engaged) {
      if (Math.abs(coord - startCoord) < DRAG_THRESHOLD_PX) return;
      engaged = true;
      for (const cell of cfg.draggedCells) cell.classList.add('cm-atomic-table-cell-dragging');
    }
    if (coord < min || coord > max) {
      gap = null;
      cfg.showIndicator(null);
      return;
    }
    const candidate = nearestGapIndex(cfg.boundaries, coord);
    gap = isNoopGap(cfg.origin, candidate) ? null : candidate;
    cfg.showIndicator(gap);
  };

  const cleanup = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('keydown', onKeyDown, true);
    for (const cell of cfg.draggedCells) cell.classList.remove('cm-atomic-table-cell-dragging');
    cfg.showIndicator(null);
  };

  const onUp = (event: PointerEvent) => {
    const wasEngaged = engaged;
    const finalGap = gap;
    cleanup();
    if (!wasEngaged) {
      cfg.openMenu(event);
      return;
    }
    if (finalGap === null) return; // dropped outside the table, or back where it started
    cfg.commit(gapToMoveTarget(cfg.origin, finalGap));
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    engaged = false; // so a later pointerup (listener already removed by cleanup) can't fire the menu either
    cleanup();
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('keydown', onKeyDown, true);
}

// [excalisidian] Column-resize DOM helpers (doc 14 §1.5). The drag needs to mutate the live
// `<colgroup>`/`cm-atomic-table-fixed`/`data-width` state WITHOUT dispatching (§1.5 "durante o
// arrasto, só a tela muda"), and to put it back exactly as it was on `Escape` or a no-op click —
// including reverting an automatic table's live conversion into a fixed one if the drag never
// actually moved anything. A snapshot of the three pieces that change is enough to restore.
interface FixedWidthSnapshot {
  hadFixedClass: boolean;
  colgroupHTML: string | null;
  thWidths: (string | undefined)[];
}

function captureFixedWidthSnapshot(table: HTMLTableElement): FixedWidthSnapshot {
  const colgroup = table.querySelector('colgroup');
  const ths = Array.from(table.querySelectorAll<HTMLTableCellElement>('thead th'));
  return {
    hadFixedClass: table.classList.contains('cm-atomic-table-fixed'),
    colgroupHTML: colgroup ? colgroup.outerHTML : null,
    thWidths: ths.map((th) => th.dataset.width),
  };
}

function restoreFixedWidthSnapshot(table: HTMLTableElement, snapshot: FixedWidthSnapshot): void {
  table.querySelector('colgroup')?.remove();
  if (snapshot.colgroupHTML) table.insertAdjacentHTML('afterbegin', snapshot.colgroupHTML);
  table.classList.toggle('cm-atomic-table-fixed', snapshot.hadFixedClass);
  const ths = Array.from(table.querySelectorAll<HTMLTableCellElement>('thead th'));
  ths.forEach((th, i) => {
    const w = snapshot.thWidths[i];
    if (w === undefined) delete th.dataset.width;
    else th.dataset.width = w;
  });
}

// Applies `widths` to the live DOM: rebuilds the `<colgroup>`, sets the fixed-layout class, and
// stamps `data-width` on every header cell (so a later `readModelFromDom` — e.g. from another
// menu action mid-drag-unrelated-editor-event — sees the same widths this function just painted).
function applyFixedWidthDom(table: HTMLTableElement, widths: number[]): void {
  table.querySelector('colgroup')?.remove();
  table.insertBefore(buildColgroup(widths), table.firstChild);
  table.classList.add('cm-atomic-table-fixed');
  const ths = Array.from(table.querySelectorAll<HTMLTableCellElement>('thead th'));
  ths.forEach((th, i) => {
    th.dataset.width = String(widths[i] ?? '');
  });
}

// Pointermove-only update: just the `<col>` percentages (doc 14 §1.5 "durante o arrasto, só a
// tela muda") — `data-width` stays at its pre-drag value until `applyFixedWidthDom`/the eventual
// dispatch rewrites it, matching the task's explicit instruction to touch only `<col>` here.
function updateColgroupWidths(table: HTMLTableElement, widths: number[]): void {
  const cols = table.querySelectorAll<HTMLTableColElement>('colgroup > col');
  cols.forEach((col, i) => {
    col.style.width = `${(widths[i] ?? 0) * 100}%`;
  });
}

// [excalisidian] Column-resize drag (doc 14 §1.5): pointer events only (never HTML5 DnD — same
// WebView2 constraint documented at this file's top). Mirrors `runHandleDrag`'s click-vs-drag
// threshold and cleanup discipline, but resizing has no "gap" to land on — the border moves
// continuously with the pointer via `resizeColumns`, and the only terminal states are "commit
// the final model" (moved past the threshold) or "put everything back" (never moved, `Escape`,
// or `pointercancel`).
function startColumnResizeDrag(
  startEvent: PointerEvent,
  view: EditorView,
  wrap: HTMLElement,
  surface: HTMLElement,
  table: HTMLTableElement,
  handle: HTMLElement,
  border: number,
  onDragChange: (dragging: boolean) => void,
): void {
  const startModel = readModelFromDom(wrap);
  const referenceWidth = table.getBoundingClientRect().width;
  const columnCount = startModel.header.length;
  const snapshot = captureFixedWidthSnapshot(table);

  // First resize of an automatic table (doc 14 §1.5): today's on-screen pixel widths become the
  // stored fractions, and the DOM switches to fixed layout right away so the drag has something
  // live to manipulate — even before the pointer has moved past the click/drag threshold.
  let base = startModel;
  if (!base.widths) {
    const headerCells = Array.from(table.querySelectorAll<HTMLTableCellElement>('thead th'));
    const pxWidths = headerCells.map((th) => th.getBoundingClientRect().width);
    const initialWidths = normalizeWidths(pxWidths);
    base = { ...base, widths: initialWidths };
    applyFixedWidthDom(table, initialWidths);
  }
  const baseWidths = base.widths as number[];

  const minFraction = Math.min(MIN_COLUMN_WIDTH_PX / referenceWidth, 1 / columnCount);
  const startX = startEvent.clientX;
  const headerCells = Array.from(table.querySelectorAll<HTMLTableCellElement>('thead th'));

  let engaged = false;
  let current = base;

  const repositionHandleToBorder = () => {
    const leftRect = headerCells[border]?.getBoundingClientRect();
    const rightRect = headerCells[border + 1]?.getBoundingClientRect();
    if (!leftRect || !rightRect) return;
    const surfaceRect = surface.getBoundingClientRect();
    const borderX = (leftRect.right + rightRect.left) / 2;
    handle.style.left = `${borderX - surfaceRect.left - RESIZE_HOVER_RANGE_PX}px`;
  };

  const cleanup = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('keydown', onKeyDown, true);
    document.body.classList.remove('cm-atomic-table-resizing');
    handle.classList.remove('is-dragging');
    try {
      handle.releasePointerCapture(startEvent.pointerId);
    } catch {
      // Not captured, or already released — nothing to clean up.
    }
    onDragChange(false);
  };

  const onMove = (event: PointerEvent) => {
    const dx = event.clientX - startX;
    if (!engaged) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      engaged = true;
    }
    const delta = dx / referenceWidth;
    current = resizeColumns(base, border, delta, minFraction);
    updateColgroupWidths(table, current.widths ?? baseWidths);
    repositionHandleToBorder();
  };

  const onUp = () => {
    cleanup();
    if (!engaged) {
      restoreFixedWidthSnapshot(table, snapshot);
      return;
    }
    dispatchModel(view, wrap, current);
  };

  const onCancel = () => {
    cleanup();
    restoreFixedWidthSnapshot(table, snapshot);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    cleanup();
    restoreFixedWidthSnapshot(table, snapshot);
  };

  document.body.classList.add('cm-atomic-table-resizing');
  handle.classList.add('is-dragging');
  onDragChange(true);
  try {
    handle.setPointerCapture(startEvent.pointerId);
  } catch {
    // Pointer capture is a nice-to-have (keeps the resize responsive if the cursor slips off the
    // 8px zone); its absence doesn't break the drag since the listeners are on `window`.
  }

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  window.addEventListener('keydown', onKeyDown, true);
}

// [excalisidian] Builds every hover control for one table widget instance: the "+" strips, both
// drag handles, and the drop indicator (doc 14 §1.3/§2.3). Called once from `toDOM`, skipped
// entirely in read-only mode. All positioning is absolute inside `surface`
// (`.cm-atomic-table-surface`, `position: relative` with permanently-reserved padding — see
// that class's comment in `styles/inline-preview.css`), so nothing here ever changes `wrap`'s
// rendered box size, which is what keeps CM6's heightmap in sync (doc 14 §2.3 item 7).
function attachTableControls(
  view: EditorView,
  wrap: HTMLElement,
  surface: HTMLElement,
  table: HTMLTableElement,
): void {
  const labels = view.state.facet(tableLabelsFacet);

  // "+" strips: always in the DOM; `.is-hovering` on `wrap` (set from plain pointerenter/leave,
  // no geometry math needed since the strips live inside `wrap` itself) toggles their
  // opacity/pointer-events in CSS. Never appear/disappear by changing layout.
  const addCol = document.createElement('div');
  addCol.className = 'cm-atomic-table-add-col';
  addCol.title = labels.addColumn;
  addCol.setAttribute('role', 'button');
  addCol.setAttribute('aria-label', labels.addColumn);
  addCol.innerHTML = ICON_PLUS;
  addCol.addEventListener('pointerdown', (event) => {
    if (event.button === 0) event.preventDefault();
  });
  addCol.addEventListener('click', () => appendColumn(view, wrap));
  surface.appendChild(addCol);

  const addRow = document.createElement('div');
  addRow.className = 'cm-atomic-table-add-row';
  addRow.title = labels.addRow;
  addRow.setAttribute('role', 'button');
  addRow.setAttribute('aria-label', labels.addRow);
  addRow.innerHTML = ICON_PLUS;
  addRow.addEventListener('pointerdown', (event) => {
    if (event.button === 0) event.preventDefault();
  });
  addRow.addEventListener('click', () => appendRow(view, wrap));
  surface.appendChild(addRow);

  wrap.addEventListener('pointerenter', () => wrap.classList.add('is-hovering'));
  wrap.addEventListener('pointerleave', () => wrap.classList.remove('is-hovering'));

  // Drag handles: one instance each, repositioned on every pointermove over the table instead
  // of built per-row/per-column — doc 06 says the alça mirrors `AlcaBloco`'s single-instance
  // gesture, and this way there's no per-row DOM to keep in sync as rows are added/removed.
  const rowHandle = document.createElement('div');
  rowHandle.className = 'cm-atomic-table-row-handle';
  rowHandle.title = labels.rowHandle;
  rowHandle.setAttribute('aria-label', labels.rowHandle);
  rowHandle.innerHTML = ICON_GRIP_VERTICAL;
  surface.appendChild(rowHandle);

  const colHandle = document.createElement('div');
  colHandle.className = 'cm-atomic-table-col-handle';
  colHandle.title = labels.columnHandle;
  colHandle.setAttribute('aria-label', labels.columnHandle);
  colHandle.innerHTML = ICON_GRIP_HORIZONTAL;
  surface.appendChild(colHandle);

  const dropIndicator = document.createElement('div');
  dropIndicator.className = 'cm-atomic-table-drop-indicator';
  surface.appendChild(dropIndicator);

  // [excalisidian] Column-resize handle (doc 14 §1.5): one instance, repositioned in `reposition`
  // below like the row/col drag handles above, but shown by PROXIMITY to an internal border
  // instead of by being "over" a row/column — see `nearestResizeBorder`.
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'cm-atomic-table-resize-handle';
  resizeHandle.title = labels.resizeHandle;
  resizeHandle.setAttribute('aria-label', labels.resizeHandle);
  surface.appendChild(resizeHandle);

  let hoveredRow = -1;
  let hoveredCol = -1;
  let hoveredBorder = -1;
  let resizing = false;

  const hideRowHandle = () => {
    hoveredRow = -1;
    rowHandle.classList.remove('is-visible');
  };
  const hideColHandle = () => {
    hoveredCol = -1;
    colHandle.classList.remove('is-visible');
  };
  const hideResizeHandle = () => {
    hoveredBorder = -1;
    resizeHandle.classList.remove('is-visible');
  };

  // Reads geometry fresh on every call rather than caching it: table hover is a short-lived,
  // local interaction (unlike `moverBloco.ts`'s page-spanning block drag), so the cache
  // invalidation machinery that needs isn't worth it here.
  const reposition = (clientX: number, clientY: number) => {
    const surfaceRect = surface.getBoundingClientRect();

    const bodyRows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr'));
    const row = bodyRows.find((tr) => {
      const r = tr.getBoundingClientRect();
      return clientY >= r.top && clientY <= r.bottom;
    });
    if (row) {
      hoveredRow = bodyRows.indexOf(row);
      const r = row.getBoundingClientRect();
      rowHandle.style.top = `${r.top - surfaceRect.top}px`;
      rowHandle.style.height = `${r.height}px`;
      rowHandle.classList.add('is-visible');
    } else {
      hideRowHandle();
    }

    const headerCells = Array.from(table.querySelectorAll<HTMLTableCellElement>('thead th'));
    const col = headerCells.find((th) => {
      const r = th.getBoundingClientRect();
      return clientX >= r.left && clientX <= r.right;
    });
    if (col) {
      hoveredCol = headerCells.indexOf(col);
      const r = col.getBoundingClientRect();
      colHandle.style.left = `${r.left - surfaceRect.left}px`;
      colHandle.style.width = `${r.width}px`;
      colHandle.classList.add('is-visible');
    } else {
      hideColHandle();
    }

    // Resize handle: skipped while a drag is in progress — its position is driven by the drag
    // itself (`startColumnResizeDrag`'s `repositionHandleToBorder`), and re-deriving it here from
    // raw pointer proximity would fight that (a drag routinely moves the pointer several table
    // rows away from the border it's resizing, which would otherwise read as "not close enough,
    // hide the handle" mid-drag).
    if (!resizing) {
      const tableRect = table.getBoundingClientRect();
      const withinTableHeight = clientY >= tableRect.top && clientY <= tableRect.bottom;
      if (withinTableHeight && headerCells.length > 1) {
        const borders = headerCells
          .slice(0, -1)
          .map((th, i) => (th.getBoundingClientRect().right + headerCells[i + 1].getBoundingClientRect().left) / 2);
        const border = nearestResizeBorder(borders, clientX, RESIZE_HOVER_RANGE_PX);
        if (border !== null) {
          hoveredBorder = border;
          resizeHandle.style.left = `${borders[border] - surfaceRect.left - RESIZE_HOVER_RANGE_PX}px`;
          resizeHandle.classList.add('is-visible');
        } else {
          hideResizeHandle();
        }
      } else {
        hideResizeHandle();
      }
    }
  };

  surface.addEventListener('pointermove', (event) => reposition(event.clientX, event.clientY));
  surface.addEventListener('pointerleave', () => {
    hideRowHandle();
    hideColHandle();
    if (!resizing) hideResizeHandle();
  });

  const cellsInRow = (rowIndex: number): HTMLElement[] => {
    const tr = table.querySelectorAll<HTMLTableRowElement>('tbody tr')[rowIndex];
    return tr ? Array.from(tr.querySelectorAll<HTMLElement>('td')) : [];
  };
  // Includes the header cell on purpose: "colunas movem com o cabeçalho junto" (doc 14 §1.3) —
  // the header is part of what's visually "the column" being dragged.
  const cellsInColumn = (colIndex: number): HTMLElement[] =>
    Array.from(table.querySelectorAll<HTMLElement>('tr'))
      .map((tr) => tr.children.item(colIndex) as HTMLElement | null)
      .filter((cell): cell is HTMLElement => cell !== null);

  rowHandle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || hoveredRow < 0) return;
    event.preventDefault();
    const rowIndex = hoveredRow;
    const bodyRows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr'));
    const boundaries = [bodyRows[0]?.getBoundingClientRect().top ?? 0];
    for (const tr of bodyRows) boundaries.push(tr.getBoundingClientRect().bottom);
    const surfaceRect = surface.getBoundingClientRect();

    runHandleDrag(event, {
      boundaries,
      origin: rowIndex,
      draggedCells: cellsInRow(rowIndex),
      axisCoord: (e) => e.clientY,
      showIndicator: (gap) => {
        if (gap === null) {
          dropIndicator.classList.remove('is-visible');
          return;
        }
        dropIndicator.classList.remove('is-col');
        dropIndicator.classList.add('is-visible', 'is-row');
        dropIndicator.style.top = `${boundaries[gap] - surfaceRect.top}px`;
      },
      commit: (target) => {
        const model = readModelFromDom(wrap);
        dispatchModel(view, wrap, moveRow(model, rowIndex, target));
      },
      openMenu: (e) =>
        dispatchTableMenu(view, wrap, 'row-handle', rowIndex, 0, e.clientX, e.clientY),
    });
  });

  colHandle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || hoveredCol < 0) return;
    event.preventDefault();
    const colIndex = hoveredCol;
    const headerCells = Array.from(table.querySelectorAll<HTMLTableCellElement>('thead th'));
    const boundaries = [headerCells[0]?.getBoundingClientRect().left ?? 0];
    for (const th of headerCells) boundaries.push(th.getBoundingClientRect().right);
    const surfaceRect = surface.getBoundingClientRect();

    runHandleDrag(event, {
      boundaries,
      origin: colIndex,
      draggedCells: cellsInColumn(colIndex),
      axisCoord: (e) => e.clientX,
      showIndicator: (gap) => {
        if (gap === null) {
          dropIndicator.classList.remove('is-visible');
          return;
        }
        dropIndicator.classList.remove('is-row');
        dropIndicator.classList.add('is-visible', 'is-col');
        dropIndicator.style.left = `${boundaries[gap] - surfaceRect.left}px`;
      },
      commit: (target) => {
        const model = readModelFromDom(wrap);
        dispatchModel(view, wrap, moveColumn(model, colIndex, target));
      },
      openMenu: (e) =>
        dispatchTableMenu(view, wrap, 'column-handle', -1, colIndex, e.clientX, e.clientY),
    });
  });

  // Column resize (doc 14 §1.5). `resizing` gates `reposition`'s own border-proximity check
  // above so the two don't fight over the handle's position while a drag is live.
  resizeHandle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || hoveredBorder < 0) return;
    event.preventDefault();
    startColumnResizeDrag(
      event,
      view,
      wrap,
      surface,
      table,
      resizeHandle,
      hoveredBorder,
      (dragging) => {
        resizing = dragging;
      },
    );
  });

  // Double-click resets to automatic width — a no-op when the table has none (doc 14 §1.5:
  // "senão é no-op"). Goes through `dispatchModel` (one transaction, one `Ctrl+Z`) like every
  // other menu-equivalent action in this file.
  resizeHandle.addEventListener('dblclick', (event) => {
    event.preventDefault();
    const model = readModelFromDom(wrap);
    if (!model.widths) return;
    dispatchModel(view, wrap, clearWidths(model));
  });
}

// ---- menu / model mutation ------------------------------------------

function cellRowIndex(cell: HTMLElement): number {
  // Rows are indexed within tbody (header isn't a "row" we can
  // insert-above; header context items are column-only).
  const tr = cell.closest<HTMLElement>('tr');
  const tbody = tr?.closest<HTMLElement>('tbody');
  if (!tr || !tbody) return -1;
  return Array.from(tbody.querySelectorAll<HTMLElement>('tr')).indexOf(tr);
}

function cellColIndex(cell: HTMLElement): number {
  const tr = cell.closest<HTMLElement>('tr');
  if (!tr) return -1;
  return Array.from(tr.querySelectorAll<HTMLElement>('th, td')).indexOf(cell);
}

function dispatchModel(
  view: EditorView,
  wrap: HTMLElement,
  nextModel: TableModel,
): void {
  // A menu can outlive the editable widget that created it when the
  // host toggles reading mode. Guard before touching its now-detached
  // DOM so a stale menu action cannot mutate a read-only document (or
  // make posAtDOM throw on the detached table wrapper).
  if (view.state.facet(readOnlyFacet)) return;
  const range = findCurrentTableRange(view, wrap);
  if (!range) return;
  const next = serializeTable(nextModel);
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: next },
  });
}

// [excalisidian] Right-click on a cell: locate the table, describe the click as a
// `TableMenuRequest` (doc 14 §2.2) and hand it to whatever's registered on `tableMenuFacet`. No
// handler registered → no-op, by design (see the file header comment): this file never falls
// back to building its own menu again.
// [excalisidian] Shared by the cell right-click (`requestTableMenu`, below) and both drag
// handles' click-not-drag path (`attachTableControls`'s `openMenu` callbacks): resolves the
// table, builds the `TableMenuRequest` (doc 14 §2.2) and hands it to whatever's registered on
// `tableMenuFacet`. No handler registered → no-op, by design (see the file header comment).
function dispatchTableMenu(
  view: EditorView,
  wrap: HTMLElement,
  scope: TableMenuScope,
  row: number,
  col: number,
  x: number,
  y: number,
): void {
  const handler = view.state.facet(tableMenuFacet);
  if (!handler) return;
  const range = findCurrentTableRange(view, wrap);
  if (!range) return;
  const tableFrom = range.from;
  const model = readModelFromDom(wrap);

  handler({
    scope,
    x,
    y,
    row,
    col,
    model,
    apply: (next, focus) => {
      const currentWrap = findTableWrapAt(view, tableFrom) ?? wrap;
      dispatchModel(view, currentWrap, next);
      if (focus) focusTableCell(view, tableFrom, focus.row, focus.col);
    },
    deleteTable: () => {
      const currentWrap = findTableWrapAt(view, tableFrom) ?? wrap;
      deleteTable(view, currentWrap);
    },
  });
}

function requestTableMenu(view: EditorView, cell: HTMLElement, x: number, y: number): void {
  const wrap = cell.closest<HTMLElement>('.cm-atomic-table');
  if (!wrap) return;
  const isHeader = cell.tagName === 'TH';
  const row = isHeader ? -1 : cellRowIndex(cell);
  const col = cellColIndex(cell);
  dispatchTableMenu(view, wrap, isHeader ? 'cell-header' : 'cell-body', row, col, x, y);
}

function dispatchModelFromDom(view: EditorView, cell: HTMLElement): void {
  if (view.state.facet(readOnlyFacet)) return;
  const wrap = cell.closest<HTMLElement>('.cm-atomic-table');
  if (!wrap) return;
  const range = findCurrentTableRange(view, wrap);
  if (!range) return;

  const model = readModelFromDom(wrap);
  const next = serializeTable(model);
  // Guard against no-op dispatches.
  if (view.state.sliceDoc(range.from, range.to) === next) return;

  view.dispatch({
    changes: { from: range.from, to: range.to, insert: next },
    // Tag as typing so CM6's history coalesces consecutive cell edits
    // into one undo group instead of one step per keystroke (each of
    // which rewrites the whole table range).
    annotations: Transaction.userEvent.of('input.type'),
  });
}

function moveCellFocus(view: EditorView, cell: HTMLElement, dir: 1 | -1): void {
  const wrap = cell.closest<HTMLElement>('.cm-atomic-table');
  if (!wrap) return;
  const cells = getAllCells(wrap);
  const idx = cells.indexOf(cell);
  if (idx < 0) return;

  const next = idx + dir;
  if (next < 0) {
    // Shift-Tab from the first cell — blur the source; let the
    // browser decide where focus goes next (probably the previous
    // focusable element on the page). CM6 keeps its own selection
    // where it was.
    getCellSource(cell)?.blur();
    return;
  }
  if (next >= cells.length) {
    // Tab past the last cell — append a new empty row and focus its
    // first cell.
    appendRow(view, wrap);
    return;
  }
  const source = getCellSource(cells[next]);
  if (!source) return;
  source.focus();
  placeCaretAtEnd(source);
}

function appendRow(view: EditorView, wrap: HTMLElement): void {
  if (view.state.facet(readOnlyFacet)) return;
  const range = findCurrentTableRange(view, wrap);
  if (!range) return;
  const model = readModelFromDom(wrap);
  const next = insertRow(model, model.rows.length);
  dispatchModel(view, wrap, next);
  // See `focusTableCell`'s comment for why this polls instead of relying on a single
  // `requestAnimationFrame`/`requestMeasure` callback.
  focusTableCell(view, range.from, next.rows.length - 1, 0);
}

// [excalisidian] Mirror of `appendRow` for the "+" add-column strip (doc 14 §1.3). Focuses the
// new column's HEADER cell — the column's cells span every row, and the header is the one
// that's always visible regardless of how many body rows exist (including zero extra rows), so
// it's the closest thing to "the first new cell" a column-shaped insert has.
function appendColumn(view: EditorView, wrap: HTMLElement): void {
  if (view.state.facet(readOnlyFacet)) return;
  const range = findCurrentTableRange(view, wrap);
  if (!range) return;
  const model = readModelFromDom(wrap);
  const next = insertColumn(model, model.header.length);
  dispatchModel(view, wrap, next);
  focusTableCell(view, range.from, -1, next.header.length - 1);
}

// [excalisidian] "Excluir tabela" (doc 14 §1.3/§2.2): remove the table's block AND the blank
// line that trails it. Every table on disk carries exactly one trailing blank line — inserted
// on creation (§1.1) so the GFM parser doesn't glue the next paragraph onto the table — so
// leaving it behind after deleting the table would strand an orphaned blank line with no table
// above it to justify it. Cursor lands where the table used to start, one transaction.
function deleteTable(view: EditorView, wrap: HTMLElement): void {
  if (view.state.facet(readOnlyFacet)) return;
  const range = findCurrentTableRange(view, wrap);
  if (!range) return;
  const { doc } = view.state;
  const startLine = doc.lineAt(range.from);
  let endLineNumber = doc.lineAt(range.to).number;

  if (endLineNumber + 1 <= doc.lines) {
    const afterLine = doc.line(endLineNumber + 1);
    if (afterLine.text.trim() === '') endLineNumber = afterLine.number;
  }

  const from = startLine.from;
  // Deleting up to the START of the line after the table (rather than to that removed line's
  // own `.to`) also consumes the newline that separated them, so nothing but the table (and its
  // one trailing blank line, if any) disappears — no leftover blank line, no merged paragraphs.
  const to = endLineNumber < doc.lines ? doc.line(endLineNumber + 1).from : doc.line(endLineNumber).to;

  view.dispatch({
    changes: { from, to, insert: '' },
    selection: EditorSelection.cursor(from),
  });
}

// Backspace at the line immediately after a table normally deletes
// the `\n` separator and merges the line-below into the table's last
// source line. Lezer then re-parses the merged content as part of
// the table (or mangles it), producing the "swallow" behavior where
// content below the table looks like it's been absorbed as new rows.
//
// Instead, when the caret sits right after a Table and the user hits
// backspace, select the whole Table range — same pattern Obsidian
// uses for treating the table as an atomic unit for deletion. The
// caller can press backspace again to actually delete the selected
// table.
function backspaceAtTableBoundary(view: EditorView): boolean {
  const { state } = view;
  if (state.facet(readOnlyFacet)) return false;
  const sel = state.selection.main;
  if (!sel.empty) return false;
  const pos = sel.head;
  if (pos === 0) return false;

  const tree = syntaxTree(state);
  let tableBefore: SyntaxNode | null = null;

  // Scan a few positions back for a Table whose end is adjacent to
  // the caret. `table.to` is the position just after the table's
  // last character — if the caret sits on the next line, `pos` will
  // be one past `table.to` (the \n separator at `table.to` + start
  // of the line after). Accept both.
  tree.iterate({
    from: Math.max(0, pos - 2),
    to: pos,
    enter: (n) => {
      if (n.name !== 'Table') return;
      if (n.to === pos || n.to + 1 === pos) {
        tableBefore = n.node;
      }
    },
  });

  if (!tableBefore) return false;

  const range: SyntaxNode = tableBefore;
  view.dispatch({
    selection: EditorSelection.range(range.from, range.to),
  });
  return true;
}

// ---- state field ----------------------------------------------------

function buildTableWidgets(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const readOnly = state.facet(readOnlyFacet);
  // Force full-doc parse so tables past the initial parsed region
  // also get the widget treatment. This StateField only rebuilds on
  // doc change; CM6's background parser advancing the tree later
  // doesn't retrigger it, so a partial tree at mount means orphaned
  // `| col |` raw lines for the rest of the session. 200ms budget
  // bounds the worst case on very long atoms.
  const tree =
    ensureSyntaxTree(state, state.doc.length, 200) ?? syntaxTree(state);
  const doc = state.doc;

  tree.iterate({
    enter: (node) => {
      if (node.name !== 'Table') return;
      // Block-replace needs whole-line coverage; it also gives us a stable range to slice raw
      // text from. [excalisidian] Parsing goes through `parseTableText` (table-model.ts)
      // instead of walking `TableHeader`/`TableRow`/`TableDelimiter` child nodes by hand — the
      // lezer node only tells us WHERE the table is; what's actually in the delimiter row
      // (including alignment) is read from the text itself, the same parser `table-model.test.ts`
      // exercises directly.
      const startLine = doc.lineAt(node.from);
      const endLine = doc.lineAt(node.to);
      const model = parseTableText(doc.sliceString(startLine.from, endLine.to));
      if (!model) return;

      ranges.push(
        Decoration.replace({
          widget: new TableWidget(model, readOnly),
          block: true,
        }).range(startLine.from, endLine.to),
      );
      return false; // don't descend
    },
  });

  return Decoration.set(ranges, true);
}

// Detect whether a doc change could have added, removed, or modified
// a Table node. Two cheap signals:
//
//   1. Any existing table decoration overlaps the changed range
//      (edit to / deletion of an existing table).
//   2. Any line touched by the change contains a pipe `|`. GFM
//      tables are pipe-delimited, so every table line has one and
//      editing one without touching a pipe character is impossible.
//      Prose rarely contains pipes; the occasional false positive
//      is fine because `buildTableWidgets` fails cleanly when
//      lezer didn't emit a Table.
//
// If neither fires, skip the full-doc walk and just map existing
// decorations through the change.
function changeAffectsTables(tr: Transaction, existing: DecorationSet): boolean {
  let affected = false;
  tr.changes.iterChanges((fromA, toA) => {
    if (affected) return;
    existing.between(fromA, toA, () => {
      affected = true;
      return false;
    });
  });
  if (affected) return true;

  const state = tr.state;
  tr.changes.iterChanges((_fromA, _toA, fromB, toB) => {
    if (affected) return;
    const startLine = state.doc.lineAt(fromB);
    const endLine = toB > startLine.to ? state.doc.lineAt(toB) : startLine;
    for (let n = startLine.number; n <= endLine.number; n++) {
      if (state.doc.line(n).text.includes('|')) {
        affected = true;
        break;
      }
    }
  });
  return affected;
}

const tableField = StateField.define<DecorationSet>({
  create: (state) => buildTableWidgets(state),
  update(deco, tr) {
    // Tree-growth effect: lezer's background parser caught up to a
    // region that wasn't parsed when we last built. Rebuild so any
    // newly-visible Table nodes get their widget.
    for (const effect of tr.effects) {
      if (effect.is(treeGrowthEffect)) return buildTableWidgets(tr.state);
    }
    // Reading-mode toggle: rebuild so cells re-render editable / inert.
    if (
      tr.startState.facet(readOnlyFacet) !== tr.state.facet(readOnlyFacet)
    ) {
      return buildTableWidgets(tr.state);
    }
    if (!tr.docChanged) return deco;
    const mapped = deco.map(tr.changes);
    if (!changeAffectsTables(tr, deco)) return mapped;
    return buildTableWidgets(tr.state);
  },
  provide: (f) => EditorView.decorations.from(f),
});

export interface TablesConfig {
  /**
   * Called when the user clicks the external-link icon on a link
   * rendered inside a table cell. Defaults to `window.open(url,
   * '_blank', 'noopener,noreferrer')`.
   */
  onLinkClick?: (url: string) => void;
}

const defaultLinkOpener = (url: string): void => {
  try {
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch {
    // window.open can throw in sandboxed iframes etc.
  }
};

// Per-view facet so `makeCell`'s pointerdown handler can look up the
// current link-click callback. Avoids threading the config through the
// widget constructor and toDOM args.
export const tableLinkClickFacet = Facet.define<
  (url: string) => void,
  (url: string) => void
>({
  combine: (values) => values[0] ?? defaultLinkOpener,
});

// [excalisidian] Menu facet (doc 14 §2.2). `table-widget.ts` never builds menu UI itself
// anymore — it only detects the gesture, resolves what was clicked into row/col/model, and
// calls whatever's registered here. `src/editor/extensoes/menuTabela.tsx` (project code) is the
// only consumer today; it renders the app's `Menu`/`ItemMenu` in a React root on
// `document.body`. No handler registered → right-click on a cell is a no-op (never falls back
// to the browser's native context menu, since the `contextmenu` listener always calls
// `preventDefault`).
export type TableMenuScope = 'cell-body' | 'cell-header' | 'row-handle' | 'column-handle';

export interface TableMenuRequest {
  scope: TableMenuScope;
  /** Screen coordinates to anchor the menu at. */
  x: number;
  y: number;
  /** -1 in the header (`cell-header`) or from a column handle (`column-handle`). */
  row: number;
  col: number;
  /** Snapshot of the table's current model, read fresh for every request. */
  model: TableModel;
  /** Apply `next` as the table's new content, in a single transaction; optionally focus a cell
   * in the result (row -1 = header) once the widget's DOM catches up. */
  apply(next: TableModel, focus?: { row: number; col: number }): void;
  /** Remove the table block (and its trailing blank line) as one transaction. */
  deleteTable(): void;
}

export const tableMenuFacet = Facet.define<
  (req: TableMenuRequest) => void,
  ((req: TableMenuRequest) => void) | null
>({
  combine: (values) => (values.length ? values[values.length - 1] : null),
});

export function tables(config: TablesConfig = {}): Extension {
  return [
    tableField,
    treeProgressPlugin,
    ...(config.onLinkClick ? [tableLinkClickFacet.of(config.onLinkClick)] : []),
    // Prec.high so we run before the default Backspace binding.
    Prec.high(keymap.of([{ key: 'Backspace', run: backspaceAtTableBoundary }])),
  ];
}
