# 0228 — PLAY-021: unchanged exercises carry across a republish

Status: decided, 2026-11-14 (plan approved by the owner in session). Issue #284.
Amends 0210 Decision 3.

## Context

PLAY-019 (0210) counts, in the lesson player, the exercises a learner answered
on an earlier visit, but only on the played version: a learner cannot read a
superseded version's document (`lesson_versions` RLS, 041), so the player could
not tell an unchanged exercise from a changed one. After a republish a half-done
lesson started at 0 in the player while the course page still showed the older
version's progress (0143 Decision 3).

## Options

A. A SECURITY DEFINER read that compares the old and new blocks in SQL and
   returns the caller's own scores for the unchanged ones. One read, no content
   leaves the database.
B. A content-only read ("which blocks are unchanged between v1 and v2") that
   also serves anonymous learners, whose attempts sit in the browser's store.
   It would hand any visitor a fact about unpublished history and needs the
   client to do the joining, i.e. client JS on the free lesson.
C. Leave 0210 Decision 3 as it is.

## Decisions

1. **Option A: `carried_lesson_answers(p_lesson_version_id)`, migration 110.**
   SECURITY DEFINER, `STABLE`, `search_path = public`, EXECUTE to
   `authenticated` only. It returns `(block_id, earned, possible)`: the caller's
   (`auth.uid()`) best attempt per block (the 050 order) on another version of
   the same lesson, for a block the played version holds as an exercise. Never
   a document, a block or another user's row.
2. **"Unchanged" is JSONB equality of the whole block, minus `convertedFrom`.**
   Key order does not matter (JSONB). `convertedFrom` is an authoring note the
   learner never sees. Any other edit, a typo fixed in an explanation included,
   makes the exercise new. The safe direction: an exercise counts as answered
   only when nothing the learner saw has changed.
3. **The played version must be the lesson's published version**, or the read
   returns nothing. A caller cannot probe drafts or old versions with it.
4. **Server-side only.** `getLessonVersionAttempts` (`lib/courseAttempts.ts`)
   calls the RPC beside its 048 read and relabels the rows onto the played
   version through `carriedAttempts` (`lib/lessonPlayer/answeredBefore.ts`).
   `earlierAnswers` then applies 0210's rules unchanged: only the played
   document's exercises, best per block against this version's own attempts.
   The player, the strip, "Answered before" and the completion card need no
   change, so no client byte moves. A failed RPC read (110 missing) logs and
   keeps PLAY-019's figures.
5. **Anonymous learners get no carry-over.** There is no caller to scope the
   read to, and Option B was not chosen. After a republish an anonymous
   learner's player starts the new version at 0, as under 0210.
6. **The course page is unchanged** (0143 Decision 3).

## Measured

Local stack (applied twice), then hosted through the gate, 2026-11-14.

- `supabase/verify/110_carried_lesson_answers.sql`, local: `PLAY-021 PASS:
  carried_lesson_answers`. It seeds a republish (ex1 unchanged with keys
  reordered, ex2 changed, ex3 changed only in `convertedFrom`):
  - the learner gets `ex1:1/1,ex3:1/2`, and the changed ex2 is not returned;
  - another learner gets only their own `ex1:1/2`;
  - a signed-in learner with no attempts gets nothing;
  - anon is denied EXECUTE, and a session with no `auth.uid()` gets 0 rows,
    with the learner's 2 rows beside them as the positive control;
  - the superseded v1, an unpublished draft with v2's document and another
    lesson holding an identical block all return 0;
  - attempts on the played version itself are not returned.
- Hosted: print rule latest migration 109, latest `delete_my_account` 109 (not
  touched). Probe before: 3 of 3 required tables, `lessons.published_version_id`
  present, `carried_lesson_answers` absent, latest recorded 109. Applied with
  `db query --linked -f` and recorded with `migration repair --status applied
  110`. Probe after: the function exists and is SECURITY DEFINER, anon EXECUTE
  false, authenticated true, latest recorded 110. The verify script ran with no
  error. `db query` prints no notices, so a copy with one wrong expectation was
  run too (the 0217 precedent). It failed at that assertion: `PLAY-021 FAIL: s
  on v2: … (got ex1:1/1,ex3:1/2, want WRONG)`. Seeded course and attempts left
  afterwards: 0 and 0.
- Browser, local stack (`next dev` with the local keys). `applied-practice`
  republished with `g3-odd` edited; a throwaway learner answered `g1-sort`,
  `g2-match` and `g3-odd` on the old version.
  - Signed in: strip "2/6", "Answered before" on `g1-sort` and `g2-match` only,
    card "4 exercises left". `scrollWidth/innerWidth` 360/360 and 1280/1280.
    `npm run viewport360 --expect="Answered before"`: 360/360.
  - Anonymous, same page: "0/6", no marks, "6 exercises left" (Decision 5);
    360/360 and 1280/1280.
  - Afterwards the version was restored, the new version and attempts deleted,
    and the user deleted (0 attempts, 0 versions left).
- Unit: `lib/lessonPlayer/answeredBefore.test.ts` 12/12 (4 new for
  `carriedAttempts`).
- `npm run budget`, before (card stashed) and after: byte-identical on every
  route. The free lesson (`/courses/future-imperfect/true-or-false`) reads
  **261.1 KB of 260, OVER BUDGET both times**. It was 259.9 at WRITE-002, so
  something after it pushed the route over; this card adds no client code and
  is not the cause (not traced here). The budget ran against hosted
  (`.env.local`), where the signed-in fixtures do not exist, so the `/my`,
  `/my/messages`, `/my/settings`, `/runs/*` and `/courses/coh005-fixture`
  routes FAIL on sign-in or 404 both before and after.
- Not measured: a phone, dark mode, the completed card after a carry-over in a
  browser (the strip and card share `withEarlierAnswers`, covered by 0210's
  component test).

## What would make us revisit

- Anonymous learners losing progress across republishes matters to the
  partner: then Option B, with its client cost on the free lesson.
- Edits to explanations or hints turn out to be the common republish, so
  learners keep losing answers to trivial edits. Then compare only the
  scoring-relevant parts of the item.
