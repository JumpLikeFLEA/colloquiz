# 0038 — AUTH-005: preview and publish

## Context

AUTH-005 needed publish to refuse when a newer draft was saved since preview
opened. `publish_lesson` as it existed (migration 041) took only
`(p_lesson_id, p_item_count)` and always published "whatever the latest
draft happens to be right now" — it had no way to know which version an
author had actually looked at. Satisfying the acceptance line required a
schema change, which is a `--no-approval` stop; the owner approved it with
six conditions (session, 2026-09-23), each addressed below.

## Decision 1 — `publish_lesson` gains `p_expected_version_id`, via DROP + CREATE

Migration `045_publish_lesson_version_check.sql` drops the old two-argument
`publish_lesson(UUID, INT)` before creating the new three-argument
`publish_lesson(UUID, UUID, INT)` — PostgreSQL overloads by argument list, so
a bare `CREATE OR REPLACE FUNCTION` with a different signature would have
left the old, unchecked overload callable alongside the new one. Verified
locally (`supabase start` + `db reset`, replaying every migration from 001):

```sql
SELECT proname, pronargs, pg_get_function_identity_arguments(oid) AS args
FROM pg_proc WHERE proname = 'publish_lesson';
-- 1 row: p_lesson_id uuid, p_expected_version_id uuid, p_item_count integer
```

Grants re-declared after the DROP (`REVOKE ALL ... FROM public, anon; GRANT
EXECUTE ... TO authenticated`) — confirmed via
`information_schema.routine_privileges`: `authenticated`, `postgres` (owner),
`service_role` only, no `anon`.

**"Latest version" is determined identically by both `save_lesson_version`
and `publish_lesson`**: `SELECT id FROM lesson_versions WHERE lesson_id =
p_lesson_id ORDER BY created_at DESC LIMIT 1`, run after locking the SAME row
— `SELECT course_id INTO v_course FROM lessons WHERE id = p_lesson_id FOR
UPDATE` — in both functions. This is what makes the two functions'
concurrency checks compose correctly: a save and a publish racing each other
against the same lesson serialize on that lock, so neither can observe a
"latest" the other has already superseded.

The stale check compares `p_expected_version_id` to that same latest id
(`IS DISTINCT FROM`, NULL-safe, mirroring `save_lesson_version`'s own
check). On success, `published_version_id` is set from
`p_expected_version_id` (the caller-confirmed value), not from a freshly
re-read `v_latest_id` — they are equal at that point (the check just proved
it), but writing the confirmed value keeps the statement's intent explicit:
publish exactly what was previewed, not "whatever the query happens to see."

## Decision 2 — item count is always derived server-side, never from the request

The new `POST .../publish` route (`app/api/admin/courses/[id]/lessons/
[lessonId]/publish/route.ts`) takes only `{ expectedVersionId }` in its body.
It fetches that version's own stored `document`, re-runs `parseLessonDocument`
(CNT-003) on it, and computes `countPracticeBlocks(parsed.document)` — the
same helper `lesson_versions.document` -> item count logic already used and
tested (`lib/lessons/parseLessonDocument.test.ts`). A client-supplied count
is never read. `publish_lesson`'s own `invalid_item_count` guard is
consequently unreachable from this route in practice, but is mapped in
`lib/courseAuthoringErrors.ts` anyway, matching every other RPC error code
there.

## Decision 3 — demonstrated on a seeded lesson (local Supabase)

Full protocol was not run (this card adds no new RLS policy and touches no
entitlement — `can_read_lesson`/the `lesson_versions` read policies are
unchanged by migration 045); a targeted scenario against seeded, non-empty
data was, with output printed:

1. Seeded one editor, one published course, one lesson.
2. `save_lesson_version(..., NULL)` -> v1 (`f36bfef5-…`).
3. `publish_lesson(lesson, v1, 0)` -> `{ok:true, version_id:v1}`.
   `lessons.published_version_id = v1`.
4. `save_lesson_version(..., v1)` -> v2 (`3a043ba9-…`) — a newer draft now
   exists, nothing published yet.
5. **Stale refusal**: `publish_lesson(lesson, v1, 0)` (the STALE, already-
   previewed version) -> `{ok:false, error:'stale'}`.
   `lessons.published_version_id` still `v1`, unchanged.
6. **Learner read path resolves via `published_version_id`, unchanged by the
   unpublished v2 save**: `SELECT lv.document FROM lesson_versions lv JOIN
   lessons l ON l.id = lv.lesson_id WHERE l.id = <lesson> AND lv.id =
   l.published_version_id` — this is exactly what the
   `"lesson_versions: published content read"` RLS policy (migration 041 §8)
   filters to. Returned v1's document (`"v1"` text), not v2's — publishing
   v1 and then saving v2 did not change what a learner reads.
7. `publish_lesson(lesson, v2, 0)` (the now-current version) -> `{ok:true,
   version_id:v2}`. `published_version_id` advances to v2.

Step 6 is the acceptance line 3 demonstration: publish -> save new draft ->
learner read unchanged. Not written as a `lib/` vitest test — `lesson_versions`
RLS needs a real Postgres role/JWT context vitest's `environment: "node"`
project deliberately excludes (docs/decisions/0004); this is the same class
of DB-dependent verification 041's own card already used (`supabase start` +
`db reset`, output printed), not a gap this card introduces.

## Decision 4 — preview: client wrapper + server-generated `attemptId`, author-only

`app/(main)/app/admin/courses/[id]/lessons/[lessonId]/preview/page.tsx` (a
Server Component) fetches the requested version's document via the existing
`getLessonVersionDocument` and generates `attemptId = crypto.randomUUID()`
server-side, once per request — the exact pattern docs/decisions/0029
Decision 1 establishes (not `useId()`, which is tree-position-derived and
would produce the same id on every fresh load). `PreviewClient.tsx` ("use
client") receives `document`/`attemptId` as plain JSON props and is the side
of the RSC boundary that wires up `practiceRenderer` (a function, which
cannot cross from Server to Client Component as a prop — 0029 Decision 5),
mirroring `LessonPlayerDemoClient.tsx` exactly.

**`version` is a required query param**, never defaulted to "latest": the
Preview button in `LessonContentEditor.tsx` links to `.../preview?version=
<baseVersionId>` using the CURRENT draft's id at click time. This is what
makes "the version previewed" a fixed, addressable thing for Publish (on the
next screen) to send back — if "latest" were re-resolved on every preview
page load, a reload during preview could silently start showing a newer
draft than the one Publish is about to confirm.

**Author-only access to unpublished versions is enforced in two places**:

1. The page's own admin-role gate (`profile.role !== "admin"` -> Forbidden),
   identical to `LessonContentPage` (the editor route, AUTH-002) and every
   other admin page (docs/decisions/0025) — a UI-level convention, not the
   security boundary.
2. **The actual boundary**: RLS. `"lesson_versions: editor read"` (migration
   041 §8) restricts every `lesson_versions` row — published or not — to
   `can_edit_course` editors. A non-editor hitting `/preview?version=...`
   directly, even with the admin gate somehow bypassed, gets `notFound()`
   from `page.tsx` because `getLessonVersionDocument` returns `null` under
   RLS for a version they cannot read.

**Publish lives on the preview screen, not the editor header**, so a click
is never ambiguous about which version it confirms — it is always exactly
the `versionId` that screen loaded with, never "whatever's currently in the
editor's state." A stale response renders the same "reload" banner pattern
`LessonContentEditor`'s own save-conflict banner already established.

**All five item types have real interactive renderers** —
`app/components/lesson-player/practice/index.tsx`'s `practiceRenderer`
dispatches `selection`/`selection_grid`/`ordering`/`matching`/`slots` to
PLAY-002..004's renderers; its `default` case (the PLAY-001 placeholder) is
unreachable for any of the five registered types today and exists only for
forward-compatibility with a future sixth type. Preview therefore shows the
learner's actual experience for every item type currently authorable, not a
degraded stand-in for any of them.

## Decision 5 — the "unpublished changes" indicator is a pure comparison

`lib/lessonPublishStatus.ts` — `lessonPublishStatus(baseVersionId,
publishedVersionId)` — is a pure three-state comparison
(`unpublished` / `published-current` / `published-stale`), unit-tested
without a database. `LessonContentDraft` (`lib/lessonContentAuthoring.ts`)
gained a `publishedVersionId` field (`lessons.published_version_id`) to feed
it. Surfaced only in the lesson editor header (`LessonContentEditor.tsx`),
matching the acceptance line's literal wording ("the editor shows..."). The
lesson-LIST view (`CourseDetailView.tsx`) still shows its pre-existing binary
published/unpublished badge — extending it to the same three states is easy
follow-up but not what this acceptance line asked for; left alone to keep
this card's diff scoped to what was approved.

## What would make us revisit it

- If the lesson list ever needs the three-state distinction too (not just
  the editor), reuse `lessonPublishStatus` rather than re-deriving the
  comparison — it would need `getAuthoredCourseDetail`
  (`lib/courseAuthoring.ts`) to also select each lesson's latest
  `lesson_versions.id`, which it does not today.
- If a real per-attempt storage lands (M2), `PreviewClient`'s
  `crypto.randomUUID()` `attemptId` should be revisited the same way 0029
  already flags for the real player route — not a preview-specific concern.
