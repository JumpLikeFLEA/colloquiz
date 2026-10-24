import type { ImportPlan, ImportPlanLesson } from "./plan";

/**
 * What goes to Claude (CNT-018, docs/decisions/0203). The system block is the drafting rules
 * (prompts/course-import/system-v1.md) and is the same for every call of a job, so the file
 * that follows it is cached after the first call. Each step's instruction is a prompt file
 * (plan, lesson, repair); everything the author typed or wrote is data inside tags.
 *
 * Nothing here takes a user id, a name or an email, so none can reach the provider.
 */

export const IMPORT_PROMPT_VERSION = "course-import-v1";

export type ImportPromptName = "system" | "plan" | "lesson" | "repair";

export function promptFileName(name: ImportPromptName): string {
  return `${name}-v1.md`;
}

/** The prompt files start with an HTML comment for maintainers; the model never sees it. */
export function promptBody(fileText: string): string {
  return fileText.replace(/^<!--[\s\S]*?-->\s*/, "").trim();
}

/** Text that goes into a tag: angle brackets become spaces, so the author cannot close the tag. */
export function promptSafe(text: string): string {
  return text.replace(/[<>]/g, " ");
}

export type CourseRequest = { title: string; slug: string; level: string };

function courseRequestBlock(c: CourseRequest): string {
  const data = { title: promptSafe(c.title), slug: c.slug, level: c.level };
  return `<course_request>\n${JSON.stringify(data, null, 2)}\n</course_request>`;
}

export function buildPlanMessage(instruction: string, course: CourseRequest): string {
  return `${instruction}\n\n${courseRequestBlock(course)}`;
}

export function buildLessonMessage(input: {
  instruction: string;
  course: CourseRequest;
  plan: ImportPlan;
  index: number;
  drafted: { slug: string; title: string }[];
}): string {
  const { plan, index } = input;
  const target: ImportPlanLesson = plan.lessons[index];
  const planForModel = {
    markMapping: plan.markMapping,
    lessons: plan.lessons.map((l, i) => ({ number: i + 1, slug: l.slug, title: l.title, covers: l.covers })),
  };
  return [
    input.instruction,
    courseRequestBlock(input.course),
    `<plan>\n${promptSafe(JSON.stringify(planForModel, null, 2))}\n</plan>`,
    `<lesson_to_draft>\n${promptSafe(JSON.stringify({ number: index + 1, of: plan.lessons.length, ...target }, null, 2))}\n</lesson_to_draft>`,
    `<already_drafted>\n${promptSafe(JSON.stringify(input.drafted, null, 2))}\n</already_drafted>`,
  ].join("\n\n");
}

/** The second user turn after an answer that failed validation (one repair per call, docs/decisions/0203 Decision 5). */
export function buildRepairMessage(instruction: string, errors: string[]): string {
  return `${instruction}\n\n<validation_errors>\n${promptSafe(errors.map((e) => `- ${e}`).join("\n"))}\n</validation_errors>`;
}
