import { z } from "zod";

/**
 * `authoredString` — a shared zod string validator used across every authored
 * text field: `lib/items/*` (quiz item stems, options, explanations —
 * `scripts/import-authored-questions.ts`), and every future Alliengll lesson
 * field. Originally lived in the now-retired course theory schema
 * (docs/decisions/0018 Decision 1); extracted here because it has no course
 * dependency of its own — the C0-control guard applies to any authored text.
 */

// Every authored string is single-line by default: no C0 control character
// (U+0000–U+001F), which includes literal newlines and tabs. Forbidding all of
// C0 makes the check TOTAL. It is also the belt-and-braces second line of
// defence behind the pre-parse backslash lint: by the time zod runs,
// `JSON.parse` has already turned a single-backslash "\ne"/"\to"/"\theta" into
// a control char + letter, so rejecting C0 catches those even if the content
// arrived by a route that skipped the raw-byte lint.
const C0_CONTROL = /[\u0000-\u001F]/;

// The multi-line variant: C0 minus \n (U+000A). Tab (U+0009) and every other
// control char stays forbidden — only LF is legitimate. \r is NOT in this
// character class because the transform normalizes CR/CRLF to LF BEFORE the
// refine runs, so a lone \r never reaches this test.
const C0_CONTROL_EXCEPT_LF = /[\u0000-\u0009\u000B-\u001F]/;

// Pass `{ allowNewlines: true }` on authored fields that are true prose
// paragraphs — those normalize CR/CRLF→LF and then accept lone \n but still
// reject tabs and every other C0 char. Every other field (quiz stems, options,
// correct_answer, explanations) keeps the total single-line guard so
// exact-match scoring and the backslash lint's guarantees are unaffected.
export const authoredString = (
  min = 1,
  opts?: { allowNewlines?: boolean },
) => {
  if (opts?.allowNewlines) {
    // Normalize CR/CRLF→LF via a transform, THEN pipe through the min+refine
    // so the stored value is canonical and the refine sees only \n.
    return z
      .string()
      .transform((s) => s.replace(/\r\n?/g, "\n"))
      .pipe(
        z
          .string()
          .min(min)
          .refine((s) => !C0_CONTROL_EXCEPT_LF.test(s), {
            message:
              "control character not allowed — only newlines may appear in " +
              "this field (tabs and other control chars are forbidden)",
          }),
      );
  }
  return z
    .string()
    .min(min)
    .refine((s) => !C0_CONTROL.test(s), {
      message:
        "control character not allowed — authored strings are single-line " +
        "(use separate prose blocks for paragraphs, not embedded newlines/tabs)",
    });
};
