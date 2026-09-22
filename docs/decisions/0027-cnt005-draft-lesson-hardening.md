# 0027 — CNT-005: hardening `draft-lesson.ts` before a real key is spent

**Note (2026-09-22, `docs/decisions/0028`):** `scripts/draft-lesson.ts` was
deleted the same day this decision was recorded — the very next piece of
work on CNT-005 dropped the scripted drafting step entirely in favour of a
chat session (0028), on the reasoning that the hardening below is only worth
its cost at a course volume this project doesn't have. The six decisions
below are historically accurate for the code as it stood; none of the code
they describe (`callDrafter`, `parseArgs`, `writeCourseFile`, the truncation
retry, ...) still exists. `docs/decisions/0026`'s `convertedFrom` field is
the one piece of this era that IS still live, in `lib/lessons/`.

## Context

`scripts/draft-lesson.ts` (added in `6eb6a36`, CNT-005) has never run against a
real Anthropic key — `.env.local`'s key was a placeholder (401 on the first
call). Before spending a real one, six concerns were raised against the code
as written. Decided by the owner on 2026-09-22.

This doc also retroactively records a decision `6eb6a36` made but never wrote
up: extracting `CourseFileSchema`/`LessonFileSchema` out of
`scripts/import-lesson.ts` into `lib/lessons/courseFile.ts`, so the drafting
script and the importer (CNT-004) validate against one schema instead of two
that could drift. That extraction touches CNT-004's file and existed only in
the commit message, not in `docs/decisions/`, until now — see "Retroactive
record" below.

## Decision 1 — Course-file validation failure: written, and now always non-zero exit

Previously, `CourseFileSchema.safeParse(courseFile)` failing logged errors but
`writeFileSync`'d `courseFile` (the pre-parse object) anyway, and never set
`process.exitCode` — a course file failing its own schema exited 0. The file
header already documented writing invalid **lessons** deliberately ("a draft
is not required to be perfect — the partner corrects it in the editor"); it
said nothing about an invalid course file, so this was a gap, not a decision.

**Resolved by extending the same "write anyway, but never claim success"
principle already applied to lessons, to the course file too**: `writeCourseFile`
still writes on a schema failure (a draft is still useful even when
imperfect — same reasoning as an invalid lesson), but now:
- writes `fileCheck.data` on success — not `courseFile` — so a schema default
  (e.g. `status`) is actually applied to what lands on disk, not silently
  skipped because the parsed value was discarded;
- writes the raw `courseFile` object only on failure, since there is no
  `.data` to fall back to;
- returns whether the write was valid, and the caller sets
  `process.exitCode = 1` whenever it wasn't — merged into one `hadFailure`
  flag alongside the existing invalid-lesson and drafting-failure checks
  (Decision 4), so any of these reasons produces the same non-zero exit,
  not three different signals a caller has to know to check separately.

Verified in `scripts/draft-lesson.test.ts` (`writeCourseFile` describe block):
a valid course writes `fileCheck.data` with `status` defaulted to `"draft"`
and returns `true`; an invalid `level` writes the raw object with the bad
value intact and returns `false`; zero lessons (the schema's `min(1)`) also
returns `false`.

## Decision 2 — Course slug is pinned by the caller, not drafted by the model

`plan.slug` was model-generated and decided both the output filename and (via
`import-lesson.ts`'s match-on-`courses.slug`, `docs/decisions/0023`) the
course's import identity. A re-run returning a different slug for the same
PDF would create a second course rather than updating the first.

**The slug is now resolved by `resolveCourseSlug` before any model call**:
`--slug <slug>` if given, else derived from the PDF's filename
(`slugifyFilename` — lowercased, non-alphanumeric runs collapsed to single
hyphens, extension stripped), validated against the same `slugField()`
`CourseFileSchema`/the importer already enforce. The course-plan prompt no
longer asks the model for a `slug` field at all — asking for a value the
caller was going to overwrite anyway invites exactly the drift this decision
removes.

**Why filename-derived by default rather than requiring `--slug` on every
run**: the common case (one PDF, one course, re-run to fix a bad draft) needs
determinism, not ceremony — the same filename must always resolve to the same
slug. `--slug` exists for the case a filename makes a poor slug (or a second
PDF should target an existing course under a different name).

Verified in `scripts/draft-lesson.test.ts`: `slugifyFilename` on a punctuated
filename, `resolveCourseSlug` preferring `--slug` over the derived value and
rejecting a `--slug` that isn't valid kebab-case.

## Decision 3 — Model-output boundary schemas, and truncation handled before parsing

Two related gaps in the same code path (`callDrafter`):

**Unvalidated output.** `callDrafter` returned `unknown`; every caller cast
with `as`. `draftCoursePlan`'s result drove the output filename, course slug
and level with no runtime check, and `draftQAReport`'s arrays were mapped
over unguarded — a wrong shape from the model surfaced as a confusing
downstream `TypeError` (e.g. `.map is not a function`) far from the call that
produced it, not as a clear "this response doesn't match what I asked for."

**Resolved**: `callDrafter` now takes a zod schema and validates immediately
after JSON extraction — `CoursePlanSchema`, `LessonDraftRawSchema`,
`QAReportSchema` (in `draft-lesson.ts`, not `lib/`: these validate "safe to
index into" shape for THIS script's own prompt contract, not authoring
validity — the lesson document's full per-block contract stays exactly where
it was, in `parseLessonDocument`, and the course file's full authoring
contract stays exactly where it was, in `CourseFileSchema`). A failure throws
a single error naming the call and every issue, instead of an opaque runtime
crash. `draftCoursePlan` additionally checks `plan.lessons.length ===
SECTION_PLAN.length` (a shape zod can't express against a second array) —
previously a short response silently degraded via `plan.lessons[i] ??
{title: sectionPlan.slug}` rather than failing.

**Truncation.** `max_tokens` was 8000 per lesson document call; Section F (ten
tasks, several expanding into selection+slots pairs) can plausibly exceed
that. A truncated response isn't malformed JSON so much as incomplete JSON —
it failed in `extractJSON` as a generic parse error indistinguishable from
"the model didn't follow instructions," so the validation-repair path (which
needs the model's own prior JSON to show it) never fired, and the whole run
died with no output at all — including the seven lessons that had already
drafted successfully in memory but were never written (see Decision 4).

**Resolved**: `response.stop_reason` is checked explicitly, before JSON
extraction is even attempted. `"max_tokens"` raises `DraftTruncatedError`
(name + token budget), caught one layer up by `callDrafter`, which retries
ONCE at double the token budget (capped at 16000) — mirroring the existing
"one repair call, never silently retried forever" discipline this script
already applies to validation failures. A validation repair and a truncation
retry are different code paths because they need different prompts: a
validation repair shows the model its own broken JSON; a truncated response
has no complete JSON to show.

Verified in `scripts/draft-lesson.test.ts`: `DraftTruncatedError`'s message
format; the schemas' accept/reject shape indirectly through the exported
pieces that consume them. The retry-doubling and the live API's actual
`stop_reason` behavior are NOT covered by a unit test — there is no network
call in this suite (no key is spent to run it) — so this is unverified
against the real API until the first real run; see "What would make us
revisit this."

## Decision 4 — Persist per-lesson results as they complete

The course file was only written once, after all eight lessons AND the QA
report had drafted successfully. Any exception anywhere in that sequence —
including a truncation retry that also truncated, or any other thrown error —
propagated uncaught to the top-level `.catch`, discarding every lesson
already drafted in memory. Nothing was written.

**Resolved**: `writeCourseFile` is called after every lesson iteration, not
once at the end — a crash on lesson 6 still leaves lessons 1–5 on disk. Each
lesson's drafting is now wrapped in its own `try/catch` inside the loop, so a
thrown error (truncation exhausted, a network error, anything) is recorded as
a failed lesson (`valid: false`, the error message in `errors`) rather than
aborting the whole run — the loop always completes all eight lessons. The
QA-report step is wrapped the same way: if it fails, the course file (already
fully written by the loop) is unaffected, and the `.qa.md` records that the
QA step itself failed rather than silently omitting it. All three failure
sources (course-file schema, per-lesson drafting/validation, QA-report
drafting) feed one `hadFailure` flag that sets `process.exitCode = 1` at the
end — nothing is lost, nothing is reported as clean when it wasn't.

Verified: the `writeCourseFile` fs tests (Decision 1) exercise the function
this decision calls repeatedly; the loop's own catch-and-continue behavior is
structural (no `throw` reaches past the `try` in `run()`'s loop) and is not
independently unit-tested — `run()` itself is excluded from the test suite
(no network, no key spent; see the CLI guard below).

## Decision 5 — Real flag-aware argument parsing

`argv.slice(2).find(a => !a.startsWith("--"))` picked the FIRST non-flag
token as the pdf path — so `draft-lesson.ts --out-dir authored/courses
foo.pdf` read `"authored/courses"` (the flag's own value) as the pdf path,
not `foo.pdf`.

**Resolved**: `parseArgs` walks `argv` positionally, consuming a value-taking
flag's next token as ITS value (never as the positional), and rejects an
unrecognized flag or a second positional argument outright rather than
silently taking the first one seen. Extracted as a pure, exported function
so the bug and its fix are both directly testable — see
`scripts/draft-lesson.test.ts`'s `parseArgs` describe block, which
reproduces the exact failing invocation from the card and asserts it now
resolves correctly.

## Decision 6 — Model id: `claude-sonnet-4-6` → `claude-sonnet-5`

Confirmed against Anthropic's published model table
(`platform.claude.com/docs/en/models/overview`, fetched live 2026-09-22):
the current Sonnet's Claude API ID is `claude-sonnet-5`. `claude-sonnet-4-6`
(the prior default, and still `lib/generator/llm.ts` /
`scripts/seed-questions-ai.ts`'s default) is listed there under "Legacy
models (still available)" — not wrong, not rejected by the API, but no
longer current.

Before trusting the environment's own "current models" listing over the
existing code, the installed `@anthropic-ai/sdk` (0.104.1) type definitions
were checked first (`node_modules/@anthropic-ai/sdk/resources/messages/
messages.d.ts`): its `Model` union DOES include `claude-sonnet-4-6` (matching
the real, measured run cited in `docs/decisions/0003`, line 291) but does NOT
include `claude-sonnet-5` at all — the SDK's type snapshot simply predates
the newer id; the `Model` type's `| (string & {})` catch-all means passing
`"claude-sonnet-5"` still compiles. The live docs fetch is the deciding
source, not the SDK's (older) type union.

**Only `ANTHROPIC_MODEL_DRAFTER`'s fallback in `draft-lesson.ts` was
changed.** `lib/generator/llm.ts`'s `ANTHROPIC_MODEL_GENERATOR` /
`ANTHROPIC_MODEL_CRITIC` defaults and `scripts/seed-questions-ai.ts`'s
mirror of them still default to `claude-sonnet-4-6` — out of scope for this
card (a Colloquiz-surface script, not CNT-005), proposed as its own card
below rather than folded in here.

**Proposed card**: `OPS-0xx` — confirm and update
`ANTHROPIC_MODEL_GENERATOR`/`ANTHROPIC_MODEL_CRITIC`'s fallbacks in
`lib/generator/llm.ts` (and their mirror in `scripts/seed-questions-ai.ts`,
and the `README.md` table documenting both) the same way this card confirmed
`ANTHROPIC_MODEL_DRAFTER`'s. Acceptance: both fallbacks confirmed current
against Anthropic's published model table (or deliberately left on
`claude-sonnet-4-6`/`claude-haiku-4-5-20251001` with a recorded reason), and
`README.md` matches whatever is decided.

## Retroactive record — `CourseFileSchema`/`LessonFileSchema` extraction (`6eb6a36`)

`lib/lessons/courseFile.ts` did not exist before `6eb6a36` (this CNT-005
card's first commit). Before it, `CourseFileSchema`/`LessonFileSchema` were
defined inline in `scripts/import-lesson.ts` (CNT-004). `6eb6a36` extracted
both into `lib/lessons/courseFile.ts` and had `import-lesson.ts` import them,
so the drafting script (CNT-005) and the importer (CNT-004) share one schema
instead of maintaining two that could silently drift apart on the authored
file shape. This is a real change to CNT-004's file, made inside a CNT-005
commit, and was recorded only in that commit's message — never in
`docs/decisions/`, despite touching another card's contract. Recorded here,
after the fact, so the decision has the durable record CLAUDE.md's working
agreement asks for. No behavior changed by writing this down now; `git show
6eb6a36 --stat` is the evidence for what moved.

## What would make us revisit this

- **A real run against a live key** (still blocked — see the file's own
  header) is the first evidence for whether the truncation retry actually
  fires the way Decision 3 assumes, and whether Section F needs more than
  the 16000-token ceiling. If it does, the ceiling is a parameter to raise,
  not a design to rework.
- **A second script drafting the same authored-file shape** would be a
  second reason (beyond `import-lesson.ts`) to keep
  `CourseFileSchema`/`LessonFileSchema` in `lib/lessons/` rather than
  colocating them with either script.
- **`OPS-0xx` above lands** — revisit whether all three
  `ANTHROPIC_MODEL_*` fallbacks should be confirmed together on some
  cadence, rather than one at a time per card that happens to touch one.
