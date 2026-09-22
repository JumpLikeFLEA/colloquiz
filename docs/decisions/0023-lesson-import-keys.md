# 0023 — Lesson importer: match keys, free-sample on import

## Context

CNT-004 (the lesson importer, issue #69) requires being "idempotent on
`authored_key` for courses and lessons" — a convention 0018 explicitly
listed as carried forward from the retired Colloquiz course schema
("Conventions carried forward on purpose: `authored_key` idempotent
upserts"). Checking the actual schema before writing the importer: no
`authored_key` column exists on `courses` or `lessons`.

- `authored_key` only ever existed on `questions` (added by migration 028
  for the retired course feature, dropped by migration 039 when that
  feature was retired).
- 0018 Decision 1's reshaped-`courses` column list and Decision 2's
  `lessons` column list (`id, course_id, ordinal, title, description,
  in_free_sample, published_version_id, published_item_count`) never
  included it — migration 041 (CNT-002) implemented exactly that list, and
  migration 042 (CNT-008) only added `level`/`estimated_minutes`.

So CNT-004 named a column no prior card ever created. This surfaced as a
schema-change stop (CLAUDE.md: "a schema change... Stop and ask" survives
`--no-approval`) rather than something to decide unilaterally mid-card.

Decided by the owner on 2026-09-22.

## Decision 1 — Natural keys instead of a new `authored_key` column

No `authored_key` column is added to `courses` or `lessons`. The importer
matches on keys that already carry the meaning `authored_key` would have
added:

- **Courses** match on `courses.slug` (existing, unique, migration 028).
- **Lessons** match on `(course_id, lessons.slug)` — a new `slug` column
  (migration 043), unique per course (lessons are always accessed through
  their course; a global unique index would be a stricter constraint than
  anything actually needs).

Why not re-add `authored_key`: `courses.slug` already does the job
`authored_key` would do for courses, and adding a second stable-key column
alongside an existing one is exactly the "second place that can disagree"
shape `docs/decisions/0022`'s "no second access flag" reasoning (Decision 1
there) already argues against for this schema. `lessons.slug` is genuinely
new machinery either way (no existing lesson-level natural key), so the
question was never "authored_key vs. nothing" for lessons — it was
"authored_key vs. slug", and slug wins because it also serves M2's lesson
URL segment (0018/`docs/handoff.md`: `/` is the English landing, lessons
need a URL), which a purely-internal `authored_key` would not.

**Lesson slug is immutable once created.** No RPC, policy, or importer path
updates an existing row's slug. The importer's whole re-import story depends
on the match key never moving under it, and a future URL depending on it
would break silently if it could. Enforced by convention, not a trigger —
matches `published_item_count`'s "written once, by one caller" pattern
(0018/041) rather than adding new machinery to prevent an update that no
code path attempts.

**`lessons.slug` is `NOT NULL` with no `DEFAULT`.** Safe because `lessons`
is confirmed empty on the hosted project — `SELECT count(*) FROM lessons`
via the service-role client printed `0` on 2026-09-22, immediately before
migration 043 was written (same verification 042's `courses.level` already
required and got, re-run here since a second, unrelated writer could in
principle have shipped between the two migrations — it hadn't).

**Consequence for the draft-file format (CNT-005):** a drafted lesson file
must carry a slug per lesson, generated once at drafting/creation time, not
recomputed from the title on every import (a later title edit must not
silently change re-import identity). Recorded here as a constraint on
CNT-005's future output, not decided by this card.

**Consequence for AUTH-001:** the lesson editor must generate a lesson's
slug from its title at CREATION time only (mirrors the immutability rule
above) — added to AUTH-001's acceptance list in `scripts/board/backlog.mjs`
so the requirement survives to that card. Not yet pushed to the GitHub
issue; bootstrap-board.mjs writes issues and needs the owner's go-ahead
first.

## Decision 2 — The importer never sets `in_free_sample`

The importer creates lesson rows directly (via the service-role client,
bypassing RLS — it has no authenticated user session to run `create_lesson`
as an editor), so it cannot rely on that RPC's "first lesson in the course
is free" freeze logic (041). Rather than reimplementing that rule a second
time in a different writer — which is exactly the "two places that can
disagree" failure shape 0018/0022 already warn against — new lesson rows
the importer creates simply take `in_free_sample`'s column `DEFAULT FALSE`
and the importer never writes to that column at all, on create or on
re-import.

This matches 0018 Decision 4 / 0022's existing rule that free-sample status
is "frozen into data via an explicit action, never a side effect of saving
or publishing content" (`set_lesson_free_sample`, 041) — extended here to
cover import as a third writer that also must not touch it. A freshly
imported course therefore has every lesson closed until an editor
explicitly flags a free sample through the (future) authoring UI. Not in
CNT-004's acceptance list, so not exercised by this card's own tests beyond
"the importer's INSERT never includes `in_free_sample`."

## What would make us revisit this

- A second lesson-level natural key ever conflicting with the URL slug's
  constraints (e.g. a need for slugs to be renameable) — would force
  choosing between "sluggable" and "stable re-import key" instead of one
  column serving both.
- A course-creation UI (AUTH-001) that lets an author set a course's free
  sample at creation time in one step — would need this decision's "importer
  never touches in_free_sample" boundary re-examined for whatever creation
  path that UI uses.
