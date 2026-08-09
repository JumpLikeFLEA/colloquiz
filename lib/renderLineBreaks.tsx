import { Fragment, type ReactNode } from "react";

/**
 * Shared line-break / paragraph primitives for the math-aware text pipeline.
 *
 * Only the three multi-line theory fields (prose.body, callout.body,
 * example.statement) legitimately carry `\n`; every other authored string is
 * strictly single-line by schema, so calling either function below on such a
 * string is a no-op.
 *
 * DESIGN — "approach A": paragraph boundary lives OUTSIDE segmentation, line
 * break (`<br>`) lives INSIDE the text segment, segmentMath stays untouched
 * between them. This is required because inline math `\(…\)` must flow inside
 * a paragraph — per-segment `<p>` wrapping fragments that flow.
 *
 * The pipeline every renderer follows (server HTML, learner JSX, editor
 * preview JSX — must be byte-identical):
 *
 *   raw string
 *    → splitParagraphs (split on blank lines, drop empties)
 *      → segmentMath(paragraph) → text | inline | block
 *        → text segment: split on single \n, interleave <br>
 *      → wrap each paragraph's segments in ONE <p>
 *        EXCEPT: a paragraph containing any block (`\[…\]`) segment renders
 *        WITHOUT a <p> wrapper (block math cannot nest in <p>).
 *
 * This module knows nothing about segmentation or KaTeX — it only handles the
 * paragraph split and the single-\n → <br> transform within one text segment.
 * Kept dep-free (react only) so both server and client bundles can share it.
 */

// Single source of truth for the paragraph-break rule: two or more consecutive
// \n mean a blank line, which means a new paragraph. A lone \n stays inside a
// paragraph as a line break. Only splitParagraphs consumes this.
const PARAGRAPH_SPLIT = /\n{2,}/;

/**
 * Split raw authored text into paragraphs. Empty paragraphs (from leading /
 * trailing blank lines or repeated blank lines beyond the boundary) are
 * dropped — both renderers agree on this and there is no user-visible reason
 * to render an empty paragraph; the author's blank lines are meaningful only
 * as separators.
 */
export function splitParagraphs(raw: string): string[] {
  return raw.split(PARAGRAPH_SPLIT).filter((p) => p.length > 0);
}

/**
 * Server path: turn single \n characters inside ONE already-escaped text
 * segment into `<br>` tags. CRITICAL: `escapedText` MUST already be
 * HTML-escaped by the caller (see renderToHtml in lib/richText.ts); this
 * function inserts only `<br>` tags and never escapes.
 *
 * Does NOT wrap in `<p>` — paragraph wrapping is the caller's responsibility
 * because it happens AT the segment-loop level, not inside a single text
 * segment.
 */
export function renderLinesToHtml(escapedText: string): string {
  return escapedText.split("\n").join("<br>");
}

/**
 * JSX path: turn single \n characters inside ONE text segment into `<br />`
 * nodes, interleaved with the text lines. Keys are stable and scoped by
 * `keyPrefix` so a caller mapping multiple text segments in the same list
 * keeps top-level React keys unique across siblings.
 *
 * Does NOT wrap in `<p>` — same reason as renderLinesToHtml above.
 */
export function renderLinesToNodes(
  text: string,
  keyPrefix: string,
): ReactNode[] {
  const lines = text.split("\n");
  return lines.map((line, li) => (
    <Fragment key={`${keyPrefix}-l${li}`}>
      {li > 0 && <br />}
      {line}
    </Fragment>
  ));
}
