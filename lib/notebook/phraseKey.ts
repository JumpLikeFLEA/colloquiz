/**
 * The form a phrase is compared in: migration 112's generated `phrase_key`, mirrored (0238
 * Decision 3). Typographic apostrophes U+2018, U+2019 and U+02BC become the straight one, the same
 * seven characters are trimmed (not `trim()`, which takes more), then lower case. Inner spaces are
 * left alone, as there.
 */
const EDGES = /^[ \t\n\v\f\r ]+|[ \t\n\v\f\r ]+$/g;

export function phraseKey(phrase: string): string {
  return phrase.replace(/[‘’ʼ]/g, "'").replace(EDGES, "").toLowerCase();
}
