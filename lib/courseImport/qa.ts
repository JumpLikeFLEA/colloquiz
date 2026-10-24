import type { DraftedLesson } from "./lessonResponse";
import type { ImportPlan } from "./plan";

/**
 * The QA report an author reviews before publishing (CNT-018 → CNT-019, docs/decisions/0203).
 * Three sources, none of them the model's say-so alone:
 *   - the model's own per-lesson notes (unsourced explanations, ambiguous items, answer-key
 *     problems: the QA REPORT of the drafting rules);
 *   - what the code can see in the drafted lessons (every block that carries `convertedFrom`,
 *     a lesson over the 10-15 minute rule, a lesson with no exercise);
 *   - what the conversion lost (DOCX images left out, mammoth's warnings) and what the pipeline
 *     did (a repair turn).
 * Stored in course_imports.qa as JSON, rendered by CNT-019.
 */

export type ImportConversion = { blockId: string; from: string };

export type ImportQaLesson = {
  slug: string;
  title: string;
  exercises: number;
  estimatedMinutes: number | null;
  notes: string[];
  conversions: ImportConversion[];
  /** Notes about the lesson that the code produced (not the model). */
  flags: string[];
};

export type ImportQa = {
  markMapping: string | null;
  planNotes: string[];
  /** Course-level observations: lesson count, conversion losses. */
  flags: string[];
  lessons: ImportQaLesson[];
};

export type ConversionNotes = { imagesDropped: number; warnings: string[] };

const LESSON_MINUTES_LIMIT = 15;

export function buildQa(input: {
  plan: ImportPlan;
  lessons: DraftedLesson[];
  conversion: ConversionNotes | null;
}): ImportQa {
  const { plan, lessons, conversion } = input;
  const flags: string[] = [];

  if (lessons.length < 3 || lessons.length > 8) {
    flags.push(`The course has ${lessons.length} lesson${lessons.length === 1 ? "" : "s"}; the usual size is 3 to 8.`);
  }
  if (conversion && conversion.imagesDropped > 0) {
    flags.push(
      `${conversion.imagesDropped} image${conversion.imagesDropped === 1 ? " was" : "s were"} left out of the DOCX. ` +
        "Upload them in the lesson editor where they matter.",
    );
  }
  for (const w of conversion?.warnings ?? []) flags.push(`DOCX conversion: ${w}`);

  return {
    markMapping: plan.markMapping,
    planNotes: plan.notes,
    flags,
    lessons: lessons.map((d) => lessonQa(d)),
  };
}

function lessonQa(d: DraftedLesson): ImportQaLesson {
  const blocks = d.lesson.document.filter((b): b is Record<string, unknown> => typeof b === "object" && b !== null);
  const exercises = blocks.filter((b) => b.kind === "practice").length;
  const conversions: ImportConversion[] = [];
  for (const b of blocks) {
    if (b.kind === "practice" && typeof b.convertedFrom === "string" && typeof b.id === "string") {
      conversions.push({ blockId: b.id, from: b.convertedFrom });
    }
  }

  const flags: string[] = [];
  const minutes = d.lesson.estimatedMinutes ?? null;
  if (minutes !== null && minutes > LESSON_MINUTES_LIMIT) {
    flags.push(`About ${minutes} minutes, above the 10-15 minute lesson size. Splitting it is an editorial call.`);
  }
  if (exercises === 0) flags.push("No exercises: the lesson is theory only.");
  if (d.repaired) flags.push("The first draft failed validation and was corrected once. Read this lesson with extra care.");

  return {
    slug: d.lesson.slug,
    title: d.lesson.title,
    exercises,
    estimatedMinutes: minutes,
    notes: d.qa,
    conversions,
    flags,
  };
}
