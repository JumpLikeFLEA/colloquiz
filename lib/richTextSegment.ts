/**
 * Client-safe segmentation for math-aware rich text.
 *
 * Course theory, quiz stems, options and explanations may embed LaTeX with
 * `\(…\)` (inline) and `\[…\]` (display) delimiters. `$…$` is deliberately NOT
 * a delimiter: the existing bank contains literal dollar amounts (e.g. a
 * Psychology question whose stem, an option and its `correct_answer` all read
 * "already paid $500 for it"), and correctness is exact string equality on
 * `correct_answer`, so a `$` delimiter would be a live scoring hazard.
 *
 * `segmentMath` is a left-to-right state machine, NOT a regex/indexOf split.
 * The reason is `\\`: in LaTeX `\\[6pt]` is a spaced line break (ubiquitous in
 * the `aligned` environments worked examples use). A scanner hunting for `\[`
 * would match the bracket inside `\\[6pt]` and think a display block opened.
 * The rule, in both states: consume `\\` as a literal pair before testing for
 * any delimiter. An unterminated delimiter emits the remainder as literal text.
 *
 * This module has NO katex import so it is safe to bundle into client code
 * (e.g. a live-preview renderer that dynamically imports katex itself). The
 * server-side renderer, save-validation, and offline importers all consume
 * these same primitives via `lib/richText.ts` re-exports, so segmentation
 * behaviour is guaranteed identical across every call site.
 */

export type Segment =
  | { type: "text"; value: string }
  | { type: "inline"; value: string }
  | { type: "block"; value: string };

/**
 * Shared KaTeX options. The renderer and the import-time compile check spread
 * from this so they cannot drift.
 *
 * `trust: false`, `strict: "warn"` and `maxExpand: 1000` are already KaTeX's
 * defaults — written here as intent, not as a fix. `trust` is the flag someone
 * will be tempted to flip to `true` for a clickable `\href`, and it should take
 * an argument to do that, not a shrug. `maxSize` is the one genuinely unbounded
 * by default (`Infinity`): `\rule{9999em}{9999em}` is a layout bomb the other
 * three flags do not close.
 */
export const KATEX_BASE = {
  trust: false,
  strict: "warn",
  maxExpand: 1000,
  maxSize: 10,
} as const;

/**
 * Segment `text` into literal-text and math runs. Pure; no KaTeX.
 *
 * State machine: scan left to right. `\\` is always consumed as a literal pair
 * first (so `\\[6pt]` and `x \\ )` never open/close a delimiter). `\(`/`\[`
 * open inline/display; the matching `\)`/`\]` closes. An unterminated opener
 * falls back to literal text for the remainder — it never swallows silently as
 * math. No empty text nodes are emitted.
 */
export function segmentMath(text: string): Segment[] {
  const segments: Segment[] = [];
  const n = text.length;
  let i = 0;
  let textStart = 0;

  while (i < n) {
    if (text[i] === "\\" && i + 1 < n) {
      const c = text[i + 1];

      // Literal backslash pair — never a delimiter.
      if (c === "\\") {
        i += 2;
        continue;
      }

      // Delimiter open.
      if (c === "(" || c === "[") {
        const close = c === "(" ? ")" : "]";
        const type: "inline" | "block" = c === "(" ? "inline" : "block";

        // Scan for the matching close, honouring `\\` pairs inside math so
        // that `x \\ )` in an aligned block does not false-close.
        let j = i + 2;
        let found = -1;
        while (j < n) {
          if (text[j] === "\\" && j + 1 < n) {
            const d = text[j + 1];
            if (d === "\\") {
              j += 2;
              continue;
            }
            if (d === close) {
              found = j;
              break;
            }
            j += 2;
            continue;
          }
          j += 1;
        }

        if (found >= 0) {
          if (i > textStart) {
            segments.push({ type: "text", value: text.slice(textStart, i) });
          }
          segments.push({ type, value: text.slice(i + 2, found) });
          i = found + 2;
          textStart = i;
          continue;
        }

        // Unterminated: the opener and everything after it are literal text.
        break;
      }

      // Any other backslash escape (a stray `\)`, `\int`, a LaTeX command in
      // text) is literal — skip the pair so its second char can't open a run.
      i += 2;
      continue;
    }

    i += 1;
  }

  if (textStart < n) {
    segments.push({ type: "text", value: text.slice(textStart) });
  }

  return segments;
}
