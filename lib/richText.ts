import katex from "katex";
import { segmentMath, KATEX_BASE, type Segment } from "./richTextSegment";

/**
 * Math-aware rich text.
 *
 * The pure segmentation half — `segmentMath`, `KATEX_BASE`, and the `Segment`
 * type — lives in `./richTextSegment` so client code (e.g. a live-preview
 * renderer that dynamically imports katex) can share it without pulling katex
 * into the client bundle. They are re-exported below so every existing
 * `@/lib/richText` importer keeps resolving.
 *
 * This module owns the katex-touching half: `renderMath`, `renderSegments`,
 * `renderToHtml`, and the content-keyed LRU cache. See `./richTextSegment` for
 * the segmentation state machine and the `$…$`-is-not-a-delimiter rationale.
 */

export { segmentMath, KATEX_BASE };
export type { Segment };

export type RenderedSegment =
  | { type: "text"; value: string }
  | { type: "inline"; value: string; html: string }
  | { type: "block"; value: string; html: string };

// Content-keyed render cache. Keyed on the RAW input string, which already
// encodes inline-vs-display via its delimiters, so one lookup covers
// segmentation and every KaTeX call in that string. On the server this Map is
// per-process and shared across requests — safe because the mapping is pure and
// content-keyed: no user data, identical input always yields identical output.
// Bounded and oldest-evicted; Map preserves insertion order.
const CACHE_CAP = 500;
const cache = new Map<string, RenderedSegment[]>();

function renderMath(value: string, displayMode: boolean): string {
  return katex.renderToString(value, {
    ...KATEX_BASE,
    throwOnError: false, // a bad expression must never blank a page mid-quiz
    displayMode,
  });
}

/**
 * Segmentation plus pre-rendered KaTeX HTML on every math node. Keeping the
 * KaTeX call here (not in the component) is what makes the segmenter and the
 * cache unit-testable, and lets a server component render to HTML strings.
 */
export function renderSegments(text: string): RenderedSegment[] {
  const cached = cache.get(text);
  if (cached) return cached;

  const rendered: RenderedSegment[] = segmentMath(text).map((seg) => {
    if (seg.type === "text") return seg;
    return { ...seg, html: renderMath(seg.value, seg.type === "block") };
  });

  cache.set(text, rendered);
  if (cache.size > CACHE_CAP) {
    cache.delete(cache.keys().next().value as string);
  }
  return rendered;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * A single safe HTML string: author text segments HTML-escaped, math segments
 * replaced by KaTeX's own output. For CLIENT surfaces that cannot import this
 * module without dragging `katex` into their bundle — the server builds the
 * string, the client injects it via a trivial `dangerouslySetInnerHTML` (see
 * `app/components/MathHtml.tsx`). Author text is escaped, never trusted as HTML;
 * only KaTeX output is injected verbatim.
 */
export function renderToHtml(text: string): string {
  return renderSegments(text)
    .map((seg) => (seg.type === "text" ? escapeHtml(seg.value) : seg.html))
    .join("");
}

// Test-only hooks.
export function __clearRichTextCache(): void {
  cache.clear();
}
export function __richTextCacheSize(): number {
  return cache.size;
}
export const __CACHE_CAP = CACHE_CAP;
