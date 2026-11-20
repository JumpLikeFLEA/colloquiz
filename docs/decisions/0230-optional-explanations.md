# 0230 — Explanations are optional

Ad hoc, owner, 2026-11-20. Revises 0017 Decision 3 and the "Every mistake gets
an explanation" line in `docs/handoff.md` ("Scoring and progress").

## Context

Author feedback in Studio: an exercise with no explanations cannot be saved.
The editor shows "explanationRef(s) resolve to no explanation and no
fallbackExplanation is set: <ids>" under every part. The field labels already
said "Explanation (optional …)" and "Fallback explanation (optional)", but
0017 Decision 3 made one of the two required for every part, at parse time.
The ref ids in the message mean nothing to an author.

The rule held because of `docs/handoff.md`: "Every mistake gets an
explanation." Since 0131 (PLAY-015), every wrong True/False row, matching pair,
gap and ordering row already shows the right answer ("Correct: …"), and a wrong
multiple-choice option shows the correct option marked (`optionClassName.ts`).
So a learner who gets a part wrong is told the right answer whether or not an
explanation exists.

## Options

- **A: keep the rule and only fix the message.** Authors would still have to
  write text for every exercise before saving. Rejected: this is the complaint.
- **B: optional explanations (chosen).** A part with no entry and no fallback
  parses. The learner sees the right answer and no "Why?".
- **C: optional, with a non-blocking hint in Studio.** The owner chose B
  without the hint.

## Decision

1. `checkExplanationCoverage` (`lib/items/explanations.ts`) no longer reports
   missing refs, and the five item parsers no longer add that issue. It still
   rejects an `explanations` key that no sub-part references, because that is a
   stale ref (0017's reason still holds).
2. `resolveExplanations` leaves out a wrong sub-part that has no explanation,
   instead of throwing `ExplanationResolutionError`, which is removed. Every
   caller already builds a map from its result and renders the disclosure only
   when an entry exists (`ExplanationDisclosure` behind `explanation &&`, the
   gap list's `explanation !== undefined`). The completion card's "Answer
   review" renders only when it has entries (`LessonCompletion.tsx`,
   `review.length > 0`). The stored shape is unchanged: `explanationRef` stays
   required on every part, and the editor still sets it to the part's id.
3. The editor's labels say so: "Explanation (optional)", and the fallback's
   note says that leaving both empty shows the right answer only. The Studio
   Guide's lesson tip is updated the same way.
4. The course-import prompt (`prompts/course-import/system-v1.md`) and the
   chat drafting prompt (`prompts/draft-lesson.md`) are **not** changed. They
   still tell the model that every part needs an explanation. That stricter
   instruction is still what we want from a drafted lesson, and changing the
   versioned import prompt would need a version bump for no gain. Their claim
   that a missing explanation fails validation is now stricter than the
   validator. That is harmless, and it is recorded here.

## Revisit if

- Learners report wrong answers they can't understand. Then consider option C,
  or have the import draft explanations for parts that have none.
- A future item type has no way to show its right answer. A part of that type
  with no explanation would then tell the learner nothing.
