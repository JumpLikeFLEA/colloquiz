# 0040 — AUTH-006: read-only orphan sweep for `lesson-images`

## Context

`docs/decisions/0037` defers deleting a replaced lesson image until the SAVE
that replaces it succeeds, accepting an orphaned upload (tab closed,
navigated away, CNT-003 rejected the block) as a stray-file cost, not a
correctness bug, and names a periodic sweep as the fix if that cost turns
out to matter. AUTH-006 is that sweep, scoped as report-only: "the first
run is read-only, printed output only, so the report can be sanity-checked
against real data before anything is deleted."

## Decision 1 — this card ships the report only; deletion is not implemented

The acceptance lines ask for a report, decoupled from deletion, sanity-checked
against real data before anything is deleted — they do not ask for a
`--delete` mode to exist yet. `scripts/sweep-lesson-images.ts` never calls
`.remove()`. Actually deleting bucket objects is a write against the live,
shared Supabase project, which `CLAUDE.md`'s standing rules put in the
"stop and ask before anything irreversible" category regardless of
`--no-approval`. Building the deletion path is left for a follow-up once
this report has been read against real data more than once (this session's
run is the first) and the result trusted.

## Decision 2 — "referenced" means referenced by ANY version, not just latest/published

`lesson_versions` is append-only (0018 Decision 2): every save appends a new
row rather than mutating one. A lesson's older draft versions still
legitimately point at the images authored into them at the time, even after
a newer version supersedes them. Scoping the reference check to only the
latest or published version would misreport an older version's images as
orphaned and risk them being deleted later, corrupting a revert to that
version. The sweep therefore pages through every row in `lesson_versions`
and unions every image URL any of them carries — the same conservative
direction 0037 itself takes (accept stray files over risking a live
reference).

## Decision 3 — the extraction logic lives in `lib/lessonImages.ts`, not the script

`extractLessonImageUrls` (walks a raw document for theory `image` blocks and
matching `image` content on either side) was written first inside the
script, then moved into `lib/lessonImages.ts` and covered by
`lib/lessonImages.test.ts`. Reasons:

- It is pure and dependency-free, exactly what that module already holds
  (`lessonImagePathFromUrl`, the sibling function this logic feeds into).
- A script that talks to the network at module scope (this one calls
  `createClient` and exits the process if env vars are missing, as soon as
  it is imported) is unsafe to import from a test — the test would need the
  live env configured just to reach a pure function. Keeping the pure logic
  in `lib/` sidesteps that entirely and lets it be verified without a
  network call, closing the "a check that passes on an empty result is a
  failure until proven otherwise" gap the live run alone could not close
  (see Decision 4).

## Decision 4 — verified two ways: a real run, and unit tests, not one alone

This session ran `scripts/sweep-lesson-images.ts` against the real hosted
project (`.env.local`, no local Supabase stack exists — see the `verify`
skill). The real run found 1 `lesson_versions` row, 0 referenced paths, and
(before a fix — see "What the real run found") 1 "orphaned" object that was
actually Supabase Storage's own `.emptyFolderPlaceholder` bookkeeping
object, not an authored upload.

Zero real images exist in the project yet, so the real run alone cannot
prove the reference-matching logic is correct — a script that always prints
"0 orphans" against an empty bucket is indistinguishable from a script that
is silently broken (CLAUDE.md: "a check that passes on an empty result is a
failure until proven otherwise"). `lib/lessonImages.test.ts` fills that gap
with synthetic documents: a theory image block, matching image content on
both the left and right side, non-image blocks that must be ignored, and
malformed blocks that must be skipped rather than thrown on. 9 tests, all
passing (`npx vitest run lib/lessonImages.test.ts`).

## What the real run found

The first real run reported the bucket's `.emptyFolderPlaceholder` object
(Supabase Storage's auto-created marker for an otherwise-empty "folder" in
its flat key-value store) as an orphan. This is exactly the kind of surprise
a real-data run is supposed to catch before anything is trusted: it is not
an authored upload and must never be reported as one, let alone deleted.
Fixed by filtering any object named `.emptyFolderPlaceholder` out of the
listing before the diff runs.

## What would make us revisit it

- Once real lesson images exist in the bucket and the report has been read
  against them more than once with a trusted result, add the deletion step
  the acceptance lines anticipate but do not require yet — as an explicit,
  separately-invoked mode (e.g. `--delete`), never the default, and never
  run unattended against the live project without the operator reading the
  report first.
- If `lesson_versions` grows large enough that paging through every row on
  every sweep becomes slow, revisit scoping the reference check to a
  bounded recent window — but only after weighing that against Decision 2's
  reasoning for checking every version.
