import { z } from "zod";

/**
 * Course theory content — the `TheoryBlock` union and its zod schema, shared by
 * the importer (`scripts/import-course.ts`) and the renderer (the stage page).
 *
 * Theory has NO inline formatting in v1: text segments render as plain JSX text
 * nodes, so there is no bold/italic/link/inline-code INSIDE a prose block. The
 * alternative is a markdown pipeline, which the math-rendering design deliberately
 * rejected (an `_italic_` rule over raw text would destroy every `x_1` and
 * `\sum_{i=0}` in the corpus). Formatting is therefore STRUCTURAL — `list` and
 * `definition` exist because a math text needs condition lists and a bolded term
 * at the point of definition, and each costs one union member plus a renderer
 * branch rather than a parser. Math still embeds via `\(…\)` / `\[…\]`, handled
 * by `segmentMath` (lib/richText.ts) at render time.
 */

// Every authored string is single-line by default: no C0 control character
// (U+0000–U+001F), which includes literal newlines and tabs. Forbidding all of
// C0 makes the check TOTAL. It is also the belt-and-braces second line of
// defence behind the pre-parse backslash lint (lib/courseLint.ts): by the time
// zod runs, `JSON.parse` has already turned a single-backslash
// "\ne"/"\to"/"\theta" into a control char + letter, so rejecting C0 catches
// those even if the content arrived by a route that skipped the raw-byte lint.
const C0_CONTROL = /[\u0000-\u001F]/;

// The multi-line variant: C0 minus \n (U+000A). Tab (U+0009) and every other
// control char stays forbidden — only LF is legitimate. \r is NOT in this
// character class because the transform normalizes CR/CRLF to LF BEFORE the
// refine runs, so a lone \r never reaches this test.
const C0_CONTROL_EXCEPT_LF = /[\u0000-\u0009\u000B-\u001F]/;

// Exported so the importer reuses the exact same C0 guard on question/option/
// explanation strings, not just theory blocks. Pass `{ allowNewlines: true }`
// on authored fields that are true prose paragraphs (prose.body, callout.body,
// example.statement) — those normalize CR/CRLF→LF and then accept lone \n but
// still reject tabs and every other C0 char. Every other field (quiz stems,
// options, correct_answer, explanations, definitions, list items, formula
// bodies) keeps the total single-line guard so exact-match scoring and the
// backslash lint's guarantees are unaffected.
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

// `strictObject` so a mistyped field name (e.g. `boddy`) fails loudly rather than
// being stripped and silently rendering an empty block.
const ProseBlock = z.strictObject({
  type: z.literal("prose"),
  body: authoredString(1, { allowNewlines: true }),
});

const FormulaBlock = z.strictObject({
  type: z.literal("formula"),
  body: authoredString(),
});

const ExampleBlock = z.strictObject({
  type: z.literal("example"),
  statement: authoredString(1, { allowNewlines: true }),
  steps: z.array(authoredString()).min(1),
});

const CalloutBlock = z.strictObject({
  type: z.literal("callout"),
  tone: z.enum(["note", "warning"]),
  body: authoredString(1, { allowNewlines: true }),
});

const ListBlock = z.strictObject({
  type: z.literal("list"),
  ordered: z.boolean(),
  items: z.array(authoredString()).min(1),
});

const DefinitionBlock = z.strictObject({
  type: z.literal("definition"),
  term: authoredString(),
  body: authoredString(),
});

export const TheoryBlockSchema = z.discriminatedUnion("type", [
  ProseBlock,
  FormulaBlock,
  ExampleBlock,
  CalloutBlock,
  ListBlock,
  DefinitionBlock,
]);

export const TheoryBlocksSchema = z.array(TheoryBlockSchema);

export type TheoryBlock = z.infer<typeof TheoryBlockSchema>;

// The discriminator values, for exhaustiveness assertions in the renderer.
export const THEORY_BLOCK_TYPES = [
  "prose",
  "formula",
  "example",
  "callout",
  "list",
  "definition",
] as const;
