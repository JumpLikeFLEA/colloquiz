import { z } from "zod";
import { authoredString } from "../authoredString";

/**
 * The inline markup a lesson theory block may carry: emphasis and an
 * English-span (rendered `lang="en"`, 0018 Decision 2), plus two
 * course-agnostic highlight marks, `mark_a`/`mark_b` (0022 Decision 4).
 * Represented structurally — an array of runs, each plain text plus an
 * optional set of marks — so a prose field can never carry a Markdown/HTML
 * string that would need parsing (and could corrupt content) at render
 * time. A run may carry multiple marks at once (an emphasized English term
 * highlighted as mark_a), which a `kind` discriminator union could not
 * express without nesting; a flat `marks` set expresses it directly.
 *
 * `mark_a`/`mark_b` are contrasting categories over the SAME dimension (past
 * simple vs. present perfect in the first real course; countable vs.
 * uncountable in a hypothetical other one) — a run cannot be both at once,
 * so they are mutually exclusive on a single run. Each combines freely with
 * emphasis and/or english independently (see docs/decisions/0022, "Field
 * shapes").
 *
 * No third mark beyond this closed set, no nesting, no nested nodes.
 * Widening this is a decision, not a drive-by addition; see
 * docs/decisions/0020-cnt003-lesson-blocks.md and 0022.
 */

export const INLINE_MARKS = ["emphasis", "english", "mark_a", "mark_b"] as const;
export type InlineMark = (typeof INLINE_MARKS)[number];

export const InlineRunSchema = z.strictObject({
  text: authoredString(),
  marks: z
    .array(z.enum(INLINE_MARKS))
    .max(INLINE_MARKS.length)
    .optional()
    .refine((marks) => !marks || new Set(marks).size === marks.length, {
      message: "marks must not repeat",
    })
    .refine((marks) => !marks || !(marks.includes("mark_a") && marks.includes("mark_b")), {
      message: "mark_a and mark_b are contrasting categories and cannot both apply to the same run",
    }),
});

export type InlineRun = z.infer<typeof InlineRunSchema>;

/** One prose-bearing field's full content: an ordered sequence of runs. */
export const InlineContentSchema = z.array(InlineRunSchema).min(1);

export type InlineContent = z.infer<typeof InlineContentSchema>;
