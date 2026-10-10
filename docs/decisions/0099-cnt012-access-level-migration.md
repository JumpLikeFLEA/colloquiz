# 0099 — CNT-012: the access-level migration (055)

Status: **decided unattended** (CNT-012 ran `--no-approval`). Each decision
below is a reading of docs/decisions/0094 where the text leaves a gap; none
changes 0094's rules.

## Context

0094 settled the levels (`anyone | signed_in | entitled`), the mapping
(`true → anyone`, `false → entitled`), the "at least one `anyone` lesson"
rule for self-paced courses, and the teaser (option b). CNT-012 writes it as
`supabase/migrations/055_lesson_access_levels.sql`: the column,
`can_read_lesson`, the state functions (`course_lesson_states`,
`lesson_state`), `lesson_teaser`, `set_lesson_access_level`, and re-emitted
`create_lesson`, `publish_course` and `set_lesson_free_sample`.

## Decision 1 — every course is self-paced until COH-002

0094 limits the open-lesson rule to `courses.format = 'self_paced'`, but
`courses.format` does not exist yet: `rg -n "self_paced|course_runs"
supabase/migrations` finds nothing. COH-002 adds it. Until then there is no
cohort course, so 055 applies the rule to every course. COH-002 already
rewrites `create_lesson`, `publish_course` and `set_lesson_access_level`
(it is serialised after this card), and adds the `format` condition there.

Revisit: never on its own; COH-002 closes it.

## Decision 2 — `in_free_sample` is pinned to `access_level` by a CHECK

0094 Decision 1 keeps `in_free_sample` "unread" until CNT-014 moves the TS
readers, and says "no dual-write … so the two columns cannot diverge". But
until CNT-014 ships, the TS readers (`lib/coursePage.ts:84`,
`lib/coursePageProgress.ts:30,97`, `lib/courseAuthoring.ts:153`) still read
`in_free_sample` while RLS reads `access_level`. If the old column went
stale, the UI and RLS would disagree, which is the failure mode in
docs/handoff.md.

Options:

- (a) Leave `in_free_sample` stale. The course page's "free" badge and CTA
  could point at a lesson RLS no longer opens.
- (b) Drop it now and re-add it as a generated column. That drops a column on
  the hosted DB and breaks every writer at once, which is more than this
  card needs.
- (c) **Chosen.** Add `CHECK (in_free_sample = (access_level = 'anyone'))`.
  Every writer in 055 sets both from ONE value, so this is a mirror, not an
  independent second write. Any other writer that sets one without the
  other fails loudly. `scripts/seed-local-fixtures.ts` was the only such
  writer, and now writes both. `scripts/import-lesson.ts` omits both and
  gets the matching defaults (`false` / `'entitled'`).

The CHECK goes away with the column, in the migration after CNT-014.

Revisit if a writer outside this repo (a hand-run SQL edit) needs to set
`in_free_sample` alone: it now gets a CHECK error, by design.

## Decision 3 — what "has an open lesson" counts

The rule counts **non-archived** `anyone` lessons. It does not require a
published version: the 044 header records the owner's decision
(2026-09-22) that publishing a course with zero published lessons is
allowed. Requiring a *published* `anyone` lesson would reverse that.

Consequence: `set_lesson_archived` can still archive a published course's
last `anyone` lesson. That is not in 0094's list (which names
`publish_course` and `set_lesson_access_level`), so it is proposed as a card
rather than absorbed here.

## Decision 4 — `set_lesson_free_sample` becomes a wrapper

0094 says the old RPC is "replaced in the same migration" and "deleted in
CNT-014/AUTH-009, not left as aliases". Today's editor toggle
(`app/api/admin/courses/[id]/lessons/[lessonId]/free-sample/route.ts`) still
calls it. Dropping it now would break the toggle until AUTH-009. Leaving its
old body would let it write a column RLS no longer reads. So its body is
replaced by a call to `set_lesson_access_level` (`true → anyone`,
`false → entitled`). The toggle keeps working, and it obeys the new rules
(including `no_open_lesson`). AUTH-009 deletes both the RPC and the route.
`lib/courseAuthoringErrors.ts` gains `no_open_lesson` and
`invalid_access_level` so the toggle shows a real message.

## Decision 5 — the state function's shape

- Name and columns: `course_lesson_states(p_course_id) → (lesson_id,
  access_level, state, opens_at)`. `lesson_state(p_lesson_id)` returns the
  same row for one lesson by filtering the course form, so there is one
  definition.
- `state` names what the caller still needs: `open`, `needs_sign_in`,
  `needs_entitlement`. `open` comes straight from `can_read_lesson`, so the
  state function cannot disagree with RLS.
- `access_level` is returned so CNT-014's "free" badge (level `anyone`) and
  "whole course free" pill are lookups, not TS decisions.
- `opens_at` is always NULL until COH-002.
- Rows: lessons with a published version that are listed (not archived, in a
  published course) OR readable by the caller. The second clause keeps
  PLAY-006's entitled × archived and editor × archived cells "playable"
  (0056 Decision 4). The first protocol run used the entitlement check
  alone, which dropped the editor × archived row; it was changed before
  commit. Drafts (no published version) are excluded for everyone, editors
  included, because the public page cannot render them.
- SECURITY INVOKER: it reads only what the caller's RLS allows, plus
  `can_read_lesson`, which is already SECURITY DEFINER.

## Decision 6 — `lesson_teaser` returns rows to every caller

0094 Decision 3 gates the teaser on the lesson (`signed_in`, published, not
archived, course published), not on the caller. A signed-in caller can read
the whole lesson anyway, so returning the teaser to them leaks nothing. The
cut is the first block whose `kind` is not `theory` or whose `type` is
`self_check`. That is stricter than "practice or self_check": a future block
kind (a voice block, VOICE-003) also cuts. Output is `(block_index, block)`;
`position` is a reserved word in that place.

## Revisit if

- COH-002 lands (Decision 1 is superseded there by design).
- CNT-014 drops `in_free_sample` (Decision 2's CHECK goes with it).
- The partner wants the teaser cut chosen per lesson (0094 option c).
