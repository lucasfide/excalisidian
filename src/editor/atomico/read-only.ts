import { EditorState, Facet, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

// Read-only ("reading") mode.
//
// The live-preview reveal already keys off `view.hasFocus` + the
// selection, so a view with no caret and no focus is, in effect, a
// fully-rendered reading view. Read-only mode makes that state
// permanent and re-routes clicks (links open instead of dropping a
// caret to edit).
//
// `readOnlyFacet` is the single source of truth the feature extensions
// (inline-preview, tables) read via `state.facet(readOnlyFacet)` to
// branch their behavior. It defaults to `false`, so composing
// `inlinePreview()` / `tables()` standalone — without ever supplying
// this facet — behaves exactly as before.

export const readOnlyFacet = Facet.define<boolean, boolean>({
  combine: (values) => (values.length ? values[values.length - 1] : false),
});

/**
 * Bundle the CM6 levers that make the editor read-only, plus the
 * `readOnlyFacet` the feature extensions read. Designed to live inside
 * a `Compartment` so it can be reconfigured at runtime to toggle
 * reading mode in place (no remount, scroll position preserved).
 *
 * Two distinct levers are combined:
 *   - `EditorView.editable.of(!ro)` — the UX lever. With `editable`
 *     false the `contentDOM` is no longer `contenteditable`, so there's
 *     no caret and clicks don't focus the editor — the reveal never
 *     triggers and the whole doc stays rendered.
 *   - `EditorState.readOnly.of(ro)` — defense-in-depth. Blocks
 *     paste / drop / IME edits and sets `state.readOnly` for any
 *     consumer command that checks it. It does NOT block our explicit
 *     checkbox `view.dispatch`, so checkbox toggling keeps working by
 *     design.
 *
 * In read-only the editor DOM also gets a `cm-atomic-readonly` class as
 * a styling hook (whole-link pointer cursor, inert table cells, etc.).
 */
export function readOnlyExtension(ro: boolean): Extension {
  return [
    EditorView.editable.of(!ro),
    EditorState.readOnly.of(ro),
    readOnlyFacet.of(ro),
    ro ? EditorView.editorAttributes.of({ class: 'cm-atomic-readonly' }) : [],
  ];
}
