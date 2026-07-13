/**
 * The options a question actually offers.
 *
 * `questions.options` is a fixed 4-tuple in the schema, so a question with
 * fewer than four answers pads the rest with empty strings: a true/false
 * question is stored as ["True", "False", "", ""] (see buildQuestionRows in
 * lib/authorQuiz.ts), and the quiz builder accepts a multiple-choice question
 * with as few as two filled options. Those empty slots are storage padding, not
 * answers — never render them.
 */
export function answerOptions(options: readonly string[]): string[] {
  return options.filter((o) => o.trim() !== "");
}
