import { z } from "zod";
import { authoredString } from "../authoredString";
import { CEFR_LEVELS } from "../courseLevels";

/**
 * The authored-file shape for one course plus every one of its lessons
 * (CNT-004's `authored/courses/<slug>.json`). Shared by `import-lesson.ts`
 * (CNT-004, the importer) and `validate-course-file.ts` (the offline shape
 * check a course file must pass before being handed to the importer), so
 * the two validate against one schema instead of two that could drift.
 * `document` is validated structurally only (a bare array); the actual
 * block-shape / practice-item contract is CNT-003+CNT-007's job, enforced by
 * `parseLessonDocument` — never re-implemented here.
 *
 * Originally (CNT-005) also shared with a scripted LLM drafting step
 * (`scripts/draft-lesson.ts`) that produced files in this same shape. That
 * script was dropped — docs/decisions/0028 — in favour of drafting in a chat
 * session from `prompts/draft-lesson.md`; the file CONTRACT here is
 * unchanged, only that one producer is gone. Do not reintroduce a
 * "shared with the drafting step" rationale without re-reading 0028 first.
 */

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const slugField = () => z.string().regex(SLUG_RE, "must be lowercase kebab-case (a-z, 0-9, single hyphens)");

export const LessonFileSchema = z.strictObject({
  slug: slugField(),
  title: authoredString(),
  description: authoredString(1, { allowNewlines: true }).optional(),
  estimatedMinutes: z.number().int().positive().optional(),
  document: z.array(z.unknown()),
});

export const CourseFileSchema = z
  .strictObject({
    slug: slugField(),
    title: authoredString(),
    subtitle: authoredString(1).optional(),
    description: authoredString(1, { allowNewlines: true }).optional(),
    level: z.enum(CEFR_LEVELS),
    status: z.enum(["draft", "published"]).default("draft"),
    lessons: z.array(LessonFileSchema).min(1),
  })
  .superRefine((course, ctx) => {
    const seen = new Set<string>();
    course.lessons.forEach((lesson, index) => {
      if (seen.has(lesson.slug)) {
        ctx.addIssue({
          code: "custom",
          path: ["lessons", index, "slug"],
          message: `duplicate lesson slug "${lesson.slug}" within this file`,
        });
      }
      seen.add(lesson.slug);
    });
  });

export type CourseFile = z.infer<typeof CourseFileSchema>;
export type LessonFile = z.infer<typeof LessonFileSchema>;
