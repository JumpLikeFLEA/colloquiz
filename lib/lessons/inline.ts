import { z } from "zod";
import { authoredString } from "../authoredString";

/**
 * The ONLY inline markup a lesson theory block may carry (0018 Decision 2):
 * emphasis and an English-span (rendered `lang="en"`). Represented
 * structurally — an array of runs, each plain text plus an optional set of
 * marks — so a prose field can never carry a Markdown/HTML string that would
 * need parsing (and could corrupt content) at render time. A run may carry
 * BOTH marks at once (an emphasized English term), which a `kind`
 * discriminator union could not express without nesting; a flat `marks` set
 * expresses it directly.
 *
 * No third mark, no nesting, no nested nodes — 0018 says "limited to
 * emphasis and English-span". Widening this is a decision, not a drive-by
 * addition; see docs/decisions/0020-cnt003-lesson-blocks.md.
 */

export const INLINE_MARKS = ["emphasis", "english"] as const;
export type InlineMark = (typeof INLINE_MARKS)[number];

export const InlineRunSchema = z.strictObject({
  text: authoredString(),
  marks: z
    .array(z.enum(INLINE_MARKS))
    .max(INLINE_MARKS.length)
    .optional()
    .refine((marks) => !marks || new Set(marks).size === marks.length, {
      message: "marks must not repeat",
    }),
});

export type InlineRun = z.infer<typeof InlineRunSchema>;

/** One prose-bearing field's full content: an ordered sequence of runs. */
export const InlineContentSchema = z.array(InlineRunSchema).min(1);

export type InlineContent = z.infer<typeof InlineContentSchema>;
