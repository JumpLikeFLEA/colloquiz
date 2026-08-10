import katex from "katex";
import { z } from "zod";
import { authoredString } from "@/lib/courseContent";
import { DifficultySchema } from "@/lib/generator/schema";
import { segmentMath, KATEX_BASE } from "@/lib/richText";

/**
 * Shared exercise-payload validation — the ONE place that decides whether a
 * whole-stage save is safe to persist. Mirrors lib/theoryValidate.ts: the API
 * route (`PUT /api/admin/courses/stages/[id]/exercises`) validates BEFORE
 * calling `save_stage_exercises`, and the client uses the same lib to render
 * inline field errors so the two paths cannot drift.
 *
 * Two layers, in order:
 *   1. zod — shape + authored-string refinements (min length, C0-control
 *      guard) + MCQ invariants (correct_answer ∈ options, options textually
 *      distinct, ≥ 2 options).
 *   2. KaTeX compile — every \(…\) / \[…\] segment in every authored string
 *      (question, options, correct_answer, explanation) is rendered with
 *      throwOnError:true, strict:true (shared KATEX_BASE), so an unbalanced
 *      brace fails the save rather than degrading in the learner's render.
 *
 * The RPC keeps a light structural backstop; the real bar lives here where
 * zod and katex actually run.
 */

export type ExerciseValidateError = {
  /** Zero-based index into payload.groups. */
  groupIndex: number;
  /** Zero-based index into groups[groupIndex].siblings; -1 for a whole-group error. */
  siblingIndex: number;
  /** "question", "options[2]", "correct_answer", "explanation", "variant_group", "(group)", etc. */
  field: string;
  message: string;
};

const SiblingSchema = z
  .object({
    // Existing rows carry a string id; new rows carry `_new: true`. Both cannot
    // co-exist on one row; the RPC picks the branch by `_new`.
    id: z.string().optional(),
    _new: z.boolean().optional(),
    variant_ordinal: z.number().int().min(1),
    difficulty: DifficultySchema,
    question: authoredString(10, { allowNewlines: true }),
    // MCQ: at least 2, at most 8 options. Editor UI allows add/remove
    // between those bounds; the importer's `.length(4)` is the stricter
    // authoring guideline, not a hard invariant of the store.
    options: z.array(authoredString()).min(2).max(8),
    correct_answer: authoredString(),
    explanation: authoredString(1, { allowNewlines: true }),
  })
  .refine((s) => s.options.includes(s.correct_answer), {
    message: "Correct answer must be one of the options verbatim.",
    path: ["correct_answer"],
  })
  .refine((s) => new Set(s.options).size === s.options.length, {
    message: "Options must be textually distinct (identical strings make scoring nondeterministic).",
    path: ["options"],
  });

const GroupSchema = z.object({
  variant_group: z
    .string()
    .min(1, "Group label is required.")
    .max(120)
    .refine((s) => !/\s\s|^\s|\s$/.test(s), {
      message: "Group label must be trimmed and have no double spaces.",
    }),
  siblings: z.array(SiblingSchema).min(1),
});

const PayloadSchema = z
  .object({
    group_order: z.array(z.string()).optional(),
    groups: z.array(GroupSchema),
    deleted_ids: z.array(z.string()).optional(),
  })
  .superRefine((p, ctx) => {
    // Group labels unique within a stage.
    const seen = new Map<string, number>();
    p.groups.forEach((g, i) => {
      if (seen.has(g.variant_group)) {
        ctx.addIssue({
          code: "custom",
          path: ["groups", i, "variant_group"],
          message: `Group label "${g.variant_group}" is used more than once.`,
        });
      } else {
        seen.set(g.variant_group, i);
      }

      // variant_ordinal unique within a group.
      const ordinals = new Map<number, number>();
      g.siblings.forEach((s, j) => {
        if (ordinals.has(s.variant_ordinal)) {
          ctx.addIssue({
            code: "custom",
            path: ["groups", i, "siblings", j, "variant_ordinal"],
            message: `Duplicate variant ordinal ${s.variant_ordinal} in group "${g.variant_group}".`,
          });
        } else {
          ordinals.set(s.variant_ordinal, j);
        }
      });
    });
  });

export type ValidatedExercisePayload = z.infer<typeof PayloadSchema>;

export type ExerciseValidateResult =
  | { ok: true; payload: ValidatedExercisePayload }
  | { ok: false; errors: ExerciseValidateError[] };

/**
 * The authored strings inside a sibling, paired with a stable field label.
 * Kept exhaustive by construction so a new authored field forces a case here
 * or the KaTeX compile pass silently skips it.
 */
export function siblingAuthoredFields(
  sib: z.infer<typeof SiblingSchema>,
): { field: string; value: string }[] {
  return [
    { field: "question", value: sib.question },
    ...sib.options.map((o, i) => ({ field: `options[${i}]`, value: o })),
    { field: "correct_answer", value: sib.correct_answer },
    { field: "explanation", value: sib.explanation },
  ];
}

function compileErrors(text: string): string[] {
  const errs: string[] = [];
  for (const seg of segmentMath(text)) {
    if (seg.type === "text") continue;
    try {
      katex.renderToString(seg.value, {
        ...KATEX_BASE,
        throwOnError: true,
        strict: true,
        displayMode: seg.type === "block",
      });
    } catch (e) {
      errs.push(`KaTeX rejected ${seg.type} math "${seg.value}" — ${(e as Error).message}`);
    }
  }
  return errs;
}

/**
 * Validate an arbitrary payload as a whole-stage exercise save. Returns the
 * parsed payload on success, or a flat list of per-field errors on failure.
 * Never throws.
 */
export function validateExercisePayload(input: unknown): ExerciseValidateResult {
  const parsed = PayloadSchema.safeParse(input);
  if (!parsed.success) {
    const errors: ExerciseValidateError[] = parsed.error.issues.map((issue) => {
      // Zod paths look like ["groups", 0, "siblings", 2, "options", 1]. Turn
      // the trailing part into an addressable field label; groupIndex/siblingIndex
      // are decoded from the numeric segments at the known positions.
      const path = issue.path.slice();
      let groupIndex = -1;
      let siblingIndex = -1;
      let field = "(payload)";
      if (path[0] === "groups" && typeof path[1] === "number") {
        groupIndex = path[1];
        if (path[2] === "siblings" && typeof path[3] === "number") {
          siblingIndex = path[3];
          const rest = path.slice(4);
          field =
            rest.length === 0
              ? "(sibling)"
              : rest
                  .map((p, i) =>
                    typeof p === "number" ? `[${p}]` : i === 0 ? String(p) : `.${String(p)}`,
                  )
                  .join("");
        } else {
          const rest = path.slice(2);
          field =
            rest.length === 0
              ? "(group)"
              : rest
                  .map((p, i) =>
                    typeof p === "number" ? `[${p}]` : i === 0 ? String(p) : `.${String(p)}`,
                  )
                  .join("");
        }
      }
      return { groupIndex, siblingIndex, field, message: issue.message };
    });
    return { ok: false, errors };
  }

  const errors: ExerciseValidateError[] = [];
  parsed.data.groups.forEach((group, groupIndex) => {
    group.siblings.forEach((sib, siblingIndex) => {
      for (const { field, value } of siblingAuthoredFields(sib)) {
        for (const message of compileErrors(value)) {
          errors.push({ groupIndex, siblingIndex, field, message });
        }
      }
    });
  });

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, payload: parsed.data };
}
