/**
 * The writing task's strings (WRITE-001, docs/decisions/0225). English, like
 * the rest of the lesson chrome (docs/decisions/0080 Decision 5). Kept out of
 * lib/alliengll/copy.ts for the voice task's reason: this module ships only
 * in the writing card's own chunk, which a lesson without a writing task
 * never downloads.
 */
export const writingCopy = {
  label: "Writing task",
  answerLabel: "Your answer",
  placeholder: "Write your answer here…",
  practiceNote: "Practice: your answer stays on this device.",
  counter: (n: number, max: number) => `${n} / ${max}`,
} as const;
