import { type InlineContext, type MarkdownConfig } from '@lezer/markdown';
import { tags as t } from '@lezer/highlight';

const HighlightDelim = { resolve: 'Highlight', mark: 'HighlightMark' };
let Punctuation = /[!"#$%&'()*+,\-.\/:;<=>?@\[\\\]^_`{|}~\xA1\u2010-\u2027]/;
try {
  Punctuation = new RegExp('[\\p{S}\\p{P}]', 'u');
} catch {
  // Older runtimes fall back to the ASCII+Latin punctuation set above.
}

function delimiterFlags(before: string, after: string) {
  const spacedBefore = /\s|^$/.test(before);
  const spacedAfter = /\s|^$/.test(after);
  const punctBefore = Punctuation.test(before);
  const punctAfter = Punctuation.test(after);

  return {
    canOpen: !spacedAfter && (!punctAfter || spacedBefore || punctBefore),
    canClose: !spacedBefore && (!punctBefore || spacedAfter || punctAfter),
  };
}

function isExactDoubleEquals(text: string, pos: number): boolean {
  return (
    text.slice(pos, pos + 2) === '==' &&
    text[pos - 1] !== '=' &&
    text[pos + 2] !== '='
  );
}

/** Match one complete highlight span using the same rules as the Lezer parser. */
export function matchHighlight(
  text: string,
  from: number,
): { contentFrom: number; contentTo: number; end: number } | null {
  if (!isExactDoubleEquals(text, from)) return null;

  const opener = delimiterFlags(
    text.slice(from - 1, from),
    text.slice(from + 2, from + 3),
  );
  if (!opener.canOpen) return null;

  for (
    let close = text.indexOf('==', from + 2);
    close >= 0;
    close = text.indexOf('==', close + 1)
  ) {
    if (!isExactDoubleEquals(text, close)) continue;
    const closer = delimiterFlags(
      text.slice(close - 1, close),
      text.slice(close + 2, close + 3),
    );
    if (closer.canClose && close > from + 2) {
      return { contentFrom: from + 2, contentTo: close, end: close + 2 };
    }
  }

  return null;
}

function parseHighlight(cx: InlineContext, next: number, pos: number): number {
  if (
    next !== 61 /* '=' */ ||
    cx.char(pos + 1) !== 61 ||
    cx.char(pos - 1) === 61 ||
    cx.char(pos + 2) === 61
  ) {
    return -1;
  }

  const before = cx.slice(pos - 1, pos);
  const after = cx.slice(pos + 2, pos + 3);
  const { canOpen, canClose } = delimiterFlags(before, after);

  return cx.addDelimiter(HighlightDelim, pos, pos + 2, canOpen, canClose);
}

/// Markdown extension for `==highlight==` syntax.
export const highlightMarkdown: MarkdownConfig = {
  defineNodes: [
    {
      name: 'Highlight',
      style: t.special(t.content),
    },
    {
      name: 'HighlightMark',
      style: t.processingInstruction,
    },
  ],
  parseInline: [
    {
      name: 'Highlight',
      parse: parseHighlight,
      after: 'Strikethrough',
    },
  ],
};
