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

function inlineRunSchema(opts?: { allowNewlines?: boolean }) {
  return z.strictObject({
    text: authoredString(1, opts),
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
}

export const InlineRunSchema = inlineRunSchema();

export type InlineRun = z.infer<typeof InlineRunSchema>;

/** One prose-bearing field's full content: an ordered sequence of runs. */
export const InlineContentSchema = z.array(InlineRunSchema).min(1);

export type InlineContent = z.infer<typeof InlineContentSchema>;

/** The same runs, where a run's text may also hold line breaks (`\n`; CR/CRLF
 * stored as LF, tabs still refused). Only the voice task's prompt takes it
 * (docs/decisions/0224): a renderer of such a field draws it with
 * `whitespace-pre-line`. Same TypeScript type as `InlineContent`. */
export const MultilineInlineContentSchema = z.array(inlineRunSchema({ allowNewlines: true })).min(1);

/** An optional inline field (a caption) as the editor hands it back: absent
 * when every run's text is empty. The editor reports a cleared field as
 * `[{ text: "" }]`, which `InlineContentSchema` refuses, so without this a
 * caption once typed could never be removed. Runs are not dropped one by one:
 * a run just added with "Add run" is empty until the author types in it. */
export function optionalInlineContent(content: InlineContent): InlineContent | undefined {
  return content.some((run) => run.text !== "") ? content : undefined;
}
