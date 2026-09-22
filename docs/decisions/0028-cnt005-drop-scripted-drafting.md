# 0028 — CNT-005 changes shape: drop the scripted drafting step

## Context

`scripts/draft-lesson.ts` (added `6eb6a36`; extended with the `convertedFrom`
marker in `docs/decisions/0026`; hardened against six robustness gaps —
truncation, unvalidated model output, argument parsing, a non-deterministic
slug, an incorrect exit code, incremental persistence — in
`docs/decisions/0027`, all six implemented in code and passing
`npm run check && npm test` before this decision) has still never run
against a real key — every prior session's work on it was spent making an
unattended script safer to run, not running it. Decided by the owner on
2026-09-22: drop the script. Courses will be drafted in a chat session from
the PDF instead, using the same prompt, and delivered as
`authored/courses/<slug>.json` by hand.

## Decision

`scripts/draft-lesson.ts` is deleted. Its constituent parts split three ways:

- **The prompt** (`SCHEMA_PROMPT`) moves, verbatim, to `prompts/draft-lesson.md`
  — the durable artifact, pasted into a chat session alongside the PDF.
- **The validation gate** becomes a new standalone script,
  `scripts/validate-course-file.ts`: `CourseFileSchema` for course/lesson
  metadata, then `parseLessonDocument` per lesson for the document's own
  per-block contract — the same two checks `draft-lesson.ts` ran on its own
  output before writing, now run against whatever the chat session produces.
  No `@anthropic-ai/sdk` import, no network call, no env var read — it is a
  pure offline shape check, safe to re-run as many times as needed while
  iterating on a draft, at no cost.
- **Everything else** — the scripted pipeline (three-call sequence, model
  selection, truncation retry, incremental persistence, the pinned-slug CLI,
  the generated `.qa.md` report) — is not preserved. See "What is lost" below.

## Why

`docs/decisions/0027` hardened six real gaps in the script (truncation
handling, model-output validation, argument parsing, a deterministic slug, an
incorrect exit code, incremental persistence) — real engineering, aimed at
making an unattended script safe to run against a real API key without
babysitting it. That investment is repaid by volume: many re-runs, many
courses, or both. `docs/handoff.md`'s own numbers say otherwise — **one
course exists today, two more are coming** ("Launch bar: one finished
course"). A hardened unattended pipeline built for a content treadmill of
dozens of courses is the wrong shape for three. A chat session, with a human
reading every response as it comes back, gets the same drafting quality
(same prompt, same PDF, same model) with none of that engineering cost, and
is strictly BETTER at the specific failure modes 0027 was defending against:
a truncated response is visible immediately in the transcript, not diagnosed
after the fact by a `stop_reason` check; a malformed shape is visible as
malformed prose, not caught by a zod schema three files away.

This is a volume argument, not a quality-of-drafting argument — nothing here
says the PDF-to-JSON drafting task itself was done differently or worse by
the script; it says the cost of running it unattended isn't earned back at
three courses.

## What is preserved

- **The file contract is unchanged.** `authored/courses/<slug>.json` still
  validates against `lib/lessons/courseFile.ts`'s `CourseFileSchema` (course
  + lesson metadata) and each lesson's `document` still validates against
  `parseLessonDocument` (CNT-003 + CNT-007, including `convertedFrom`, 0026).
  `scripts/import-lesson.ts` (CNT-004) needs no change — it already only
  ever consumed the file, never the script that produced it.
- **The prompt is preserved verbatim** in `prompts/draft-lesson.md`,
  including the 0022 Decision 6 conversion rules and the `convertedFrom`
  marking (0026) — nothing about WHAT to draft or HOW to mark a conversion
  was lost, only WHERE the instructions live and WHO executes them.
  `lib/lessons/courseFile.ts`'s header now describes it as the schema shared
  by the importer and the validator; the "shared with the drafting step"
  line no longer applies and was corrected in the same commit.
- **The validation gate is preserved**, now standalone and always-available
  rather than baked into a call sequence: `scripts/validate-course-file.ts`
  runs the identical two checks (`CourseFileSchema`, then
  `parseLessonDocument` per lesson) the script ran on its own output, printing
  every issue labelled by lesson slug and, for a document issue, block id —
  verified manually against a valid and an invalid fixture (exit 0 / exit 1,
  with the invalid case printing all four issues: a bad slug, a bad level, a
  too-small options array, and the "no wrong answer" invariant).

## What is lost

- **No re-runnable command.** There is no `npx tsx scripts/draft-lesson.ts
  <pdf>` producing a fresh draft on demand; drafting is now a chat session, a
  human activity with no CLI entry point. Re-drafting a course means running
  that session again, not re-invoking a script.
- **The QA report becomes a chat-session output, not a generated file.** The
  script's `draftQAReport` call produced a structured `<slug>.qa.md`
  (ambiguous items / internal inconsistencies / missing pages) as a
  side-effect of every run, guaranteed to exist. That guarantee is gone: a
  chat-session QA report is whatever the session produces and saves, by hand,
  if anyone remembers to ask for it and write it down. Nothing enforces its
  existence or its shape any more.
- **`docs/decisions/0026` and `0027`** (the conversion-marker decision and
  the six hardening decisions) describe code that no longer exists. They are
  not wrong — the decisions they record were correct for the code as it
  stood — but they are now historical: `convertedFrom` (0026) is preserved in
  `lib/lessons/parseLessonDocument.ts`, unaffected by this change, but
  `0027`'s six decisions (pinned slug, truncation retry, stop_reason
  checking, argument parsing, incremental persistence, the model id) describe
  a script that is gone. Both files get a one-line pointer to this decision
  rather than being rewritten or deleted — they are the accurate record of
  what was true when they were written.

## CNT-005's acceptance lines against this shape

CNT-005's board entry (`scripts/board/backlog.mjs`) was written entirely
against the scripted-pipeline shape:

| Acceptance line | Status against the new shape |
|---|---|
| "Drafts the whole course... one lesson per section... Level and estimated minutes taken from the PDF" | Still achievable — by the chat session following `prompts/draft-lesson.md` — but no longer VERIFIABLE by running a command; it's a property of a transcript, not a build artifact. |
| "Part 2's answers... become per-sub-part explanations..." | Same: a prompt instruction the chat session follows, not something the card can check by running anything. |
| "Converted paper tasks... marked for partner review..." | Preserved as a prompt instruction (0026's `convertedFrom` + `qaNotes` double-mark is IN `prompts/draft-lesson.md`); still not independently checkable except by reading the resulting file, which `validate-course-file.ts` cannot assess (it checks shape, not whether a conversion was correctly marked). |
| "Open-writing tasks become `self_check` blocks..." | Same as above. |
| "Paper-only instructions are rewritten for the screen" | Same as above. |
| "Emits a partner QA report alongside the drafts. It lists: ..." | **No longer guaranteed at all** — see "What is lost." A specific, named QA report (with specific named findings from ONE PDF) was never going to generalize past that first course anyway; this line was already PDF-specific. |
| "New npm dependency (a PDF parser) is still stop-and-ask..." | Moot — there is no script to add a dependency to. Still true in spirit: a chat session's own PDF handling is Anthropic's, not a new repo dependency. |
| "Every drafted lesson document passes the lesson validator... or the run reports exactly which blocks failed" | **This is now `scripts/validate-course-file.ts`'s job**, run by hand against the chat session's output, not something "the run" (there is no run) reports automatically. |
| "The drafting prompt and model call live under `scripts/`, and nothing reads the PDF at runtime" | **False under the new shape on its face** — the prompt lives under `prompts/`, not `scripts/`, and there is no "model call" in this repo at all; drafting happens outside it entirely. The "nothing reads the PDF at runtime" half is still true (the PDF is chat-session input, never touched by the running app). |

**Roughly half the acceptance lines describe a script that no longer exists
(the QA-report line, the "lives under `scripts/`" line, the dependency line
in letter if not spirit) and the other half describe drafting-quality
properties that are now unverifiable by any command** — they hold or don't
hold based on what a human chat session actually produced, checkable only by
reading the output file and running `validate-course-file.ts` against it,
never by "the run reports."

**Recommendation: close CNT-005 as superseded by this decision, and open a
narrower replacement card** scoped to what's actually left to build/verify:
`prompts/draft-lesson.md` exists and is accurate (done, this commit),
`scripts/validate-course-file.ts` exists and correctly rejects a broken file
(done, this commit, manually verified), and — the one real remaining
acceptance criterion — the first real course drafted this way passes
`validate-course-file.ts` and imports cleanly via `import-lesson.ts`. That
last line is evidence CNT-005 never got (the key was never live); it's a
better fit for CNT-006 ("End-to-end: the finished course through the
pipeline") than for a rewritten CNT-005, since CNT-006 already exists to
prove the whole PDF → draft → import → edit → publish path for real. Not
acted on here — the board stays as-is; this is a recommendation for the
owner to action.

## What would make us revisit this

- **Course volume rises meaningfully past "two or three."** If the partner's
  output cadence accelerates, or a second partner joins, re-examine whether a
  scripted pipeline earns its keep at THAT volume — the reasoning above is
  explicitly volume-dependent, not a permanent verdict against automation.
- **The chat-session QA report turns out to matter in practice** (a partner
  publishes something an automated QA pass would have caught). If so, the
  fix is process (always ask for and save a QA report at the end of a
  drafting session), not necessarily reviving the script.
