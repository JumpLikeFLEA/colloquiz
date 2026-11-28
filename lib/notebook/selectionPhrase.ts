import { noteLength, PHRASE_MAX } from "./noteForm";

/**
 * PROG-023 (docs/decisions/0253, 0254) — the phrase a lesson text selection saves, or why it can't.
 *
 * `text` is the selection's own text. `before` and `after` are the characters just outside it in
 * the Range's start and end containers (startContainer before startOffset, endContainer after
 * endOffset), and only when those containers are Text nodes; otherwise "". Start and end, never
 * anchor and focus: a backwards selection swaps those (0254).
 *
 * The rule, in order:
 *  1. A word cut at either end is extended to the whole word, from `before` / `after` only, and only
 *     when the selection's own edge character is a word character: a selection that begins or ends
 *     with a space does not pull in the neighbouring word.
 *  2. Whitespace and line breaks collapse to one space.
 *  3. Edge whitespace, quotes, brackets, dashes and bullets are trimmed, and a trailing full stop,
 *     comma, semicolon or colon; ? ! and … are kept, and so is "...".
 *  4. No letter left is `empty`; over PHRASE_MAX (lib/notebook/noteForm, 112's 200) is `too_long`.
 */
export type SelectionPhrase =
  | { ok: true; phrase: string }
  | { ok: false; reason: "empty" }
  | { ok: false; reason: "too_long"; length: number };

/** Letters (any script), marks, digits, and the apostrophes and hyphen inside a word. */
const WORD = /[\p{L}\p{M}\p{N}'’ʼ-]/u;

const LEAD = /^[\s"'«»“”„‘’‚‹›`(\[{<\-–—―‒•·▪◦‣*]+/u;
const TRAIL = /[\s"'«»“”„‘’‚‹›`)\]}>\-–—―‒•·▪◦‣*,;:]+$/u;

function wordRunAtEnd(s: string): string {
  let i = s.length;
  while (i > 0 && WORD.test(s[i - 1])) i--;
  return s.slice(i);
}

function wordRunAtStart(s: string): string {
  let i = 0;
  while (i < s.length && WORD.test(s[i])) i++;
  return s.slice(0, i);
}

function trimEdges(s: string): string {
  let prev: string;
  do {
    prev = s;
    s = s.replace(LEAD, "").replace(TRAIL, "");
    // One full stop, not an ellipsis typed as three.
    if (s.endsWith(".") && !s.endsWith("...")) s = s.slice(0, -1);
  } while (s !== prev);
  return s;
}

export function selectionPhrase({ text, before = "", after = "" }: { text: string; before?: string; after?: string }): SelectionPhrase {
  let raw = text;
  // A word cannot begin or end with an apostrophe or hyphen, so a borrowed run is cut at them
  // (an opening quote before the selection stays out).
  if (raw && WORD.test(raw[0])) raw = wordRunAtEnd(before).replace(/^['’ʼ-]+/u, "") + raw;
  if (raw && WORD.test(raw[raw.length - 1])) raw = raw + wordRunAtStart(after).replace(/['’ʼ-]+$/u, "");

  const phrase = trimEdges(raw.replace(/\s+/gu, " "));
  if (!/\p{L}/u.test(phrase)) return { ok: false, reason: "empty" };
  const length = noteLength(phrase);
  if (length > PHRASE_MAX) return { ok: false, reason: "too_long", length };
  return { ok: true, phrase };
}
