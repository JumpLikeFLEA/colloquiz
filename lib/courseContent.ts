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

// Every authored string is single-line: no C0 control character (U+0000–U+001F),
// which includes literal newlines and tabs. Theory paragraphs are separate
// `prose` blocks, so nothing legitimately needs a newline; forbidding all of C0
// makes the check TOTAL. It is also the belt-and-braces second line of defence
// behind the pre-parse backslash lint (lib/courseLint.ts): by the time zod runs,
// `JSON.parse` has already turned a single-backslash "\ne"/"\to"/"\theta" into a
// control char + letter, so rejecting C0 catches those even if the content
// arrived by a route that skipped the raw-byte lint.
const C0_CONTROL = /[\u0000-\u001F]/;

// Exported so the importer reuses the exact same C0 guard on question/option/
// explanation strings, not just theory blocks.
export const authoredString = (min = 1) =>
  z
    .string()
    .min(min)
    .refine((s) => !C0_CONTROL.test(s), {
      message:
        "control character not allowed — authored strings are single-line " +
        "(use separate prose blocks for paragraphs, not embedded newlines/tabs)",
    });

// `strictObject` so a mistyped field name (e.g. `boddy`) fails loudly rather than
// being stripped and silently rendering an empty block.
const ProseBlock = z.strictObject({
  type: z.literal("prose"),
  body: authoredString(),
});

const FormulaBlock = z.strictObject({
  type: z.literal("formula"),
  body: authoredString(),
});

const ExampleBlock = z.strictObject({
  type: z.literal("example"),
  statement: authoredString(),
  steps: z.array(authoredString()).min(1),
});

const CalloutBlock = z.strictObject({
  type: z.literal("callout"),
  tone: z.enum(["note", "warning"]),
  body: authoredString(),
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
