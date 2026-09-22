import { z } from "zod";
import { authoredString } from "../authoredString";
import { CEFR_LEVELS } from "../courseLevels";

/**
 * The authored-file shape for one course plus every one of its lessons
 * (CNT-004's `authored/courses/<slug>.json`; CNT-005 drafts into the same
 * shape). Extracted from `scripts/import-lesson.ts` (CNT-005) so the
 * drafting step and the importer validate against one schema instead of two
 * that could drift — a document each writes/reads is not re-implemented
 * per caller. `document` is validated structurally only (a bare array); the
 * actual block-shape / practice-item contract is CNT-003+CNT-007's job,
 * enforced by `parseLessonDocument` — never re-implemented here.
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
