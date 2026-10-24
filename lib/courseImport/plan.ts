import { z } from "zod";
import { authoredString } from "../authoredString";
import { slugField } from "../lessons/courseFile";
import { COURSE_SUBTITLE_MAX_LENGTH } from "../courseCatalogue";

/**
 * The plan step's answer (CNT-018, docs/decisions/0203 Decision 5): the lesson list, the
 * course's catalogue text and the mark_a / mark_b mapping. The author already typed the
 * course's title, slug and level, so none of those are in it. The plan is what every later
 * lesson call is anchored to: the slugs it lists are the lessons' slugs.
 */

export const MAX_IMPORT_LESSONS = 12;

const PlanLessonSchema = z.object({
  slug: slugField().max(80),
  title: authoredString(),
  description: authoredString(1, { allowNewlines: true }).optional(),
  estimatedMinutes: z.number().int().positive().max(240).optional(),
  /** Which part of the file the lesson covers; shown to the model, not stored in the lesson. */
  covers: z.string().max(400).default(""),
});

export const PlanSchema = z.object({
  subtitle: authoredString(1)
    .refine((s) => s.length <= COURSE_SUBTITLE_MAX_LENGTH, { message: `at most ${COURSE_SUBTITLE_MAX_LENGTH} characters` })
    .optional(),
  description: authoredString(1, { allowNewlines: true }).optional(),
  markMapping: z.string().max(600).nullable().default(null),
  lessons: z
    .array(PlanLessonSchema)
    .min(1)
    .max(MAX_IMPORT_LESSONS)
    .superRefine((lessons, ctx) => {
      const seen = new Set<string>();
      lessons.forEach((l, index) => {
        if (seen.has(l.slug)) ctx.addIssue({ code: "custom", path: [index, "slug"], message: `duplicate lesson slug "${l.slug}"` });
        seen.add(l.slug);
      });
    }),
  notes: z.array(z.string().max(600)).max(40).default([]),
});

export type ImportPlan = z.infer<typeof PlanSchema>;
export type ImportPlanLesson = ImportPlan["lessons"][number];

export type JsonExtract = { ok: true; value: unknown } | { ok: false; error: string };

/**
 * The JSON object in a model's text answer: the first ```json fence if there is one, else the
 * text itself, else the span from the first "{" to the last "}". Prose around it is tolerated;
 * the prompt asks for none.
 */
export function extractJson(text: string): JsonExtract {
  const fenced = text.match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/i);
  const trimmed = text.trim();
  const candidates = [fenced?.[1], trimmed.startsWith("{") ? trimmed : undefined];
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));

  let lastError = "no JSON object found in the answer";
  for (const c of candidates) {
    if (!c) continue;
    try {
      return { ok: true, value: JSON.parse(c) };
    } catch (e) {
      lastError = `invalid JSON: ${(e as Error).message}`;
    }
  }
  return { ok: false, error: lastError };
}

export function formatZodIssues(error: z.ZodError, limit = 25): string[] {
  const out = error.issues.slice(0, limit).map((i) => `[${i.path.join(".")}] ${i.message}`);
  if (error.issues.length > limit) out.push(`... and ${error.issues.length - limit} more`);
  return out;
}

export type PlanParse = { ok: true; plan: ImportPlan } | { ok: false; errors: string[] };

export function parsePlanResponse(text: string): PlanParse {
  const json = extractJson(text);
  if (!json.ok) return { ok: false, errors: [json.error] };
  const parsed = PlanSchema.safeParse(json.value);
  if (!parsed.success) return { ok: false, errors: formatZodIssues(parsed.error) };
  return { ok: true, plan: parsed.data };
}

/** A stored plan read back from the database: null when it is not a valid plan. */
export function readStoredPlan(value: unknown): ImportPlan | null {
  const parsed = PlanSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
