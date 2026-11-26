/**
 * An own note's form (PROG-016, docs/decisions/0241): the limits migration 112 enforces, mirrored
 * so the form can say them and refuse early. The RPC decides; this only spares a round trip.
 *
 * `_notebook_trim` (112) strips space, tab, LF, VT, FF, CR and U+00A0 from both ends, and
 * `char_length` counts code points, so an emoji is one character here as there, not two.
 */
export const PHRASE_MAX = 200;
export const NOTE_MAX = 500;
/** `notebook_note_limit()` (112): own notes per learner. */
export const NOTE_CAP = 1000;

export type NoteError =
  | "phrase_empty"
  | "phrase_too_long"
  | "note_too_long"
  | "note_cap"
  | "not_found"
  | "unauthenticated"
  | "failed";

const EDGES = /^[ \t\n\v\f\r ]+|[ \t\n\v\f\r ]+$/g;

export function trimNote(text: string): string {
  return text.replace(EDGES, "");
}

/** Characters as `char_length` counts them, after the trim. */
export function noteLength(text: string): number {
  return [...trimNote(text)].length;
}

/** The first error `_notebook_note_error` would return, or null. */
export function noteFormError(phrase: string, note: string): NoteError | null {
  const p = noteLength(phrase);
  if (p === 0) return "phrase_empty";
  if (p > PHRASE_MAX) return "phrase_too_long";
  if (noteLength(note) > NOTE_MAX) return "note_too_long";
  return null;
}

const KNOWN = new Set<NoteError>(["phrase_empty", "phrase_too_long", "note_too_long", "not_found", "unauthenticated"]);

/**
 * What a write RPC's answer means. The note cap is a PT429 raised by the insert trigger, so it
 * arrives as an error, not as `{ ok: false }`. Anything unrecognised is "failed", never success.
 */
export function noteRpcOutcome(data: unknown, error: { code?: string } | null): { ok: true } | { ok: false; error: NoteError } {
  if (error) return { ok: false, error: error.code === "PT429" ? "note_cap" : "failed" };
  const d = data as { ok?: unknown; error?: unknown } | null;
  if (d?.ok === true) return { ok: true };
  const code = d?.error;
  return { ok: false, error: typeof code === "string" && KNOWN.has(code as NoteError) ? (code as NoteError) : "failed" };
}
