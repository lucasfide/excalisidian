export { AtomicCodeMirrorEditor } from './AtomicCodeMirrorEditor';
export type {
  AtomicCodeMirrorEditorHandle,
  AtomicCodeMirrorEditorProps,
} from './AtomicCodeMirrorEditor';

// Individual extension factories. Exposed so consumers can compose a
// stripped-down editor, bisect regressions, or cherry-pick a single
// feature (tables, inline-preview, image blocks) into a different
// editor setup. The default `AtomicCodeMirrorEditor` is still the
// recommended entry point.
export { inlinePreview } from './inline-preview';
export type { InlinePreviewConfig } from './inline-preview';
export { highlightMarkdown } from './highlight';
export { imageBlocks } from './image-blocks';
export { tables } from './table-widget';
export type { TablesConfig } from './table-widget';
export { wikiLinks } from './wiki-links';
export type {
  WikiLinkResolvedTarget,
  WikiLinkStatus,
  WikiLinkSuggestion,
  WikiLinksConfig,
} from './wiki-links';
export { atomicEditorTheme, atomicMarkdownSyntax } from './atomic-theme';
export {
  autoCloseCodeFence,
  extendEmphasisPair,
  startAsteriskList,
} from './edit-helpers';
// Read-only ("reading") mode. `AtomicCodeMirrorEditor` exposes this via
// its `readOnly` prop / `setReadOnly` handle; these are for consumers
// composing a custom editor who want to drive the mode through their
// own `Compartment`.
export { readOnlyExtension, readOnlyFacet } from './read-only';
