import type { ImportPlan } from "../plan";

/** Test data for lib/courseImport: a plan, and lesson answers as the model would send them. */

export const PLAN: ImportPlan = {
  subtitle: "Two tenses, one hour",
  description: "Past simple and present perfect.",
  markMapping: "mark_a = past simple, mark_b = present perfect",
  lessons: [
    { slug: "why-two-tenses", title: "Why two tenses?", estimatedMinutes: 12, covers: "Section A" },
    { slug: "signal-words", title: "Signal words", covers: "Section B" },
  ],
  notes: ["Sections C and D were merged: D only works on C's text."],
};

export function selectionBlock(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    kind: "practice",
    type: "selection",
    payload: {
      prompt: "Which sentence is correct?",
      multi: false,
      options: [
        { id: "a", text: "She has already finished." },
        { id: "b", text: "She has finished yesterday." },
      ],
      correctOptionIds: ["a"],
      explanationRef: "r1",
      explanations: { r1: "Yesterday needs the past simple." },
    },
    ...extra,
  };
}

export function lessonFile(slug: string, over: Record<string, unknown> = {}) {
  return {
    slug,
    title: `Lesson ${slug}`,
    description: "A short lesson.",
    estimatedMinutes: 10,
    document: [
      { id: "h1", kind: "theory", type: "heading", level: 1, text: [{ text: `Lesson ${slug}` }] },
      { id: "p1", kind: "theory", type: "prose", text: [{ text: "Use the present perfect for a result that matters now." }] },
      selectionBlock("q1"),
    ],
    ...over,
  };
}

/** What a model answers for a lesson: the envelope, as JSON text. */
export function lessonAnswer(slug: string, over: { lesson?: Record<string, unknown>; qa?: string[] } = {}): string {
  return JSON.stringify({ lesson: lessonFile(slug, over.lesson), qa: over.qa ?? [] });
}

export function planAnswer(plan: ImportPlan = PLAN): string {
  return JSON.stringify(plan);
}
