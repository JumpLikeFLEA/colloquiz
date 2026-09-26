# 0050 — CNT-009: catalogue fields — course cover and short summary

## Context

CNT-009 (issue #93): the catalogue is course cards — cover, title, short
summary (owner, 2026-09-24). The issue states "neither field exists on
`courses` today (confirmed against migrations 041-045: only author_id, level
and slug were added/kept; description stays the long-form text on the course
page)".

## Decision 1 — the issue's premise was wrong; `subtitle` already IS the short summary

Checked against the LIVE `courses` table (service-role `SELECT`, not
migration-reading alone — CLAUDE.md: "never auto-accept a guess... re-derive
it from the source") before writing anything: `courses.subtitle` — added by
migration 028, before the Alliengll schema existed, and never dropped by
039/040/041 the way `subject`/`icon`/`color`/`pass_threshold`/`new_count`/
`review_slots` were left in place but abandoned — is not dead weight. It is
wired end-to-end:

- `lib/lessons/courseFile.ts:42` — `subtitle: authoredString(1).optional()`,
  part of the authored course-file schema.
- `scripts/import-lesson.ts:282,296` — writes it directly (service role,
  bypassing `create_course`/`update_course`, which never exposed it).
- `authored/courses/future-imperfect.json` — the one real seeded course has
  it populated: `"Predictions that came true, and ones that didn't. Present
  perfect vs past simple."` (89 chars).

So the issue's "neither field exists" is factually wrong for the summary
half — `subtitle` already exists and is already populated for the one real
course, just never exposed through the editor-facing RPCs (only the offline
importer could set it).

**Decision: reuse `courses.subtitle`, do not add a second `summary` column.**
Adding one would have duplicated a field the import pipeline already fills,
and left two columns meaning the same thing with no rule for which one a
future reader should trust. `cover_image_url` is the only genuinely new
column — checked the same way (no existing cover-like column; `icon`/`color`
are decorative leftovers from the retired Colloquiz course feature, unrelated
to an uploaded photo).

**Not folded into this card:** cleaning up `subject`/`icon`/`color`/
`pass_threshold`/`new_count`/`review_slots` — genuinely dead columns from the
retired Colloquiz course feature, unrelated to the catalogue-fields work this
card is scoped to. **Proposed card (not yet filed):** *drop the Colloquiz-era
`courses` columns migration 039/040 left behind* — acceptance: confirm each
is unread by any current app code or RPC (same method as this decision's
check), then drop them in one migration.

## Decision 2 — nullable, not `NOT NULL` (042's precedent doesn't transfer)

`courses` is not empty — 2 seeded draft rows, confirmed live — and neither
new writable slot is populated on at least one of them. A plain `NOT NULL`
(migration 042's approach for `level`) would fail immediately. Both columns
stay nullable in draft; "required to publish" is enforced by a `CHECK` tied
to `status` instead (Decision 4) — the correct translation of "NOT NULL at
publish" for a field that's optional until the author actually publishes,
unlike `level`, which every row must always have.

## Decision 3 — storage shape: full public URL, following the only precedent that exists

Asked and confirmed with the owner before implementing (the original premise
— that lesson documents use a bucket-relative-path convention — was checked
and found wrong): `lib/lessons/theoryBlocks.ts`'s `ImageBlockSchema.url` and
`lib/items/matching.ts`'s image `src` both store the full public URL, not a
path (confirmed by `scripts/sweep-lesson-images.ts`'s own doc comment,
which explicitly calls both "an image URL"). `profiles.avatar_url` (022)
does the same. There is no "store a bare path" convention anywhere in this
codebase. **Decision: `cover_image_url TEXT`, full public URL, matching the
only precedent that exists.**

**Bucket: reuse `lesson-images`, no new bucket.** A cover is course-owned,
exactly like a lesson image (041's own reasoning for that bucket's write
policy: "a lesson image belongs to the course, not the uploader" — equally
true of a cover). The existing policies gate writes on
`can_edit_course((storage.foldername(name))[1]::uuid, ...)` with no
restriction on what the object depicts, so no bucket or policy change is
needed. Left to AUTH-008 (the editor UI) to actually call
`lib/lessonImages.ts`'s existing upload helpers for a cover.

## Decision 4 — required-at-publish enforced in two places

`courses_published_requires_catalogue_fields`
(`CHECK (status <> 'published' OR (cover_image_url IS NOT NULL AND subtitle
IS NOT NULL))`) is the DB-level backstop that holds regardless of which code
path flips `status`. But a raw `CHECK` violation surfaces as an unhandled
Postgres exception, not this schema's usual `{ok:false, error:'...'}` JSON
contract (`lib/courseAuthoringErrors.ts`) — so both `publish_course` AND
`update_course` (the only two paths that can make the CHECK's condition
true or false) pre-check and return a clean `missing_cover`/
`missing_subtitle` error before ever reaching an `UPDATE` that could trip
it. **`update_course`'s check is what covers "a published course's cover or
summary is cleared"** (the owner's explicit ask) — clearing either field
while `status = 'published'` hits the same pre-check as publishing without
one, so the CHECK itself never actually fires through either RPC — verified
below.

`update_course`'s signature changed from four params to six (`p_subtitle`,
`p_cover_image_url` added) — `DROP FUNCTION` before `CREATE OR REPLACE`,
045/046's precedent: `CREATE OR REPLACE` alone would add a second overload
rather than replacing the four-arg version, leaving a stale signature
callable indefinitely. `publish_course`'s signature is unchanged (still just
`p_course_id`), so plain `CREATE OR REPLACE` is correct there — 045's rule
only bites when the argument *list* changes.

`update_course` is a full-record replace (same contract `title`/
`description`/`level` already have — the one caller,
`app/api/admin/courses/[id]/route.ts`, always resends the complete desired
state), not a partial patch. The route's Zod schema makes `subtitle` and
`coverImageUrl` `.nullable().optional()` so a client can both omit them
(today, since no editor UI sends them yet) and, once AUTH-008 builds that
UI, explicitly send `null` to clear either field.

## Decision 5 — length cap: 200 characters

`authoredString()` (`lib/authoredString.ts`) imposes no max length on
`subtitle` at the course-file-validation layer — this is the first cap on
it. 200 chars: comfortably above the seeded real example (89 chars), short
enough that a catalogue card can't be handed a paragraph. Enforced twice,
same reasoning as Decision 4: `courses_subtitle_length_check` (DB
backstop) and `update_course`'s own `subtitle_too_long` pre-check.
`lib/courseCatalogue.ts`'s `COURSE_SUBTITLE_MAX_LENGTH` mirrors the DB
constraint for the route's Zod schema, same relationship
`lib/courseLevels.ts`'s `CEFR_LEVELS` has to `courses_level_check` (042).

**Revisit when:** a real catalogue-card layout (SHELL-010) shows 200 chars
reads as too long or too short in practice — this number is a starting
estimate, not a measured one.

## AUTH-006's orphan sweep: updated in this commit (small)

`scripts/sweep-lesson-images.ts` only scanned `lesson_versions.document` for
referenced bucket paths. A cover living in the same bucket would have been
reported as an orphan the first time any course got one. Updated
`referencedPaths()` to also read every `courses.cover_image_url` and add its
resolved path to the referenced set (`lessonImagePathFromUrl`, already
generic across any URL containing `/lesson-images/`). One query, one loop —
small enough to fold into this card rather than a separate one, per the
issue's own instruction.

## Verification

**Method.** Neither the hosted project (migrations are written, never
applied by a session) nor an empty table proves anything (CLAUDE.md: "a
check that passes on an empty result is a failure until proven otherwise").
Verified against a local Supabase stack instead, replaying every migration
from scratch — the same method 041/042's own file headers describe.
`npx supabase start` initially failed (`storage-api` container never
reported healthy) — retried excluding the services this card doesn't need
(`gotrue, realtime, storage-api, imgproxy, edge-runtime, logflare, vector,
studio, mailpit, supavisor`), keeping Postgres + PostgREST + Kong, which
started cleanly. `npx supabase db reset` then replayed migrations
001 through 047 in order with no errors. Roles were simulated directly in
`psql` (`SET ROLE anon`/`authenticated` + `request.jwt.claims`) rather than
through real JWTs, which is the standard RLS-testing technique and exercises
the exact same policies PostgREST's role-switching does. Stopped
(`supabase stop`) and confirmed `git status` clean before and after — no
migration was applied to the hosted project at any point.

**Seeded:** one admin profile, one draft course (`draft-course`, no cover, no
subtitle), one published course (`published-course`, cover set, 25-char
subtitle).

**Results, printed:**

```
-- anon: published course row --
 slug             | subtitle                   | cover_image_url                                                    | status
 published-course | A short catalogue summary  | https://…/lesson-images/333…/cover.png                             | published

-- anon: draft course row (expect 0 rows) --
 (0 rows)

-- publish_course on draft-course with NO cover/subtitle --
 {"ok": false, "error": "missing_cover"}

-- update_course: set cover only, leave subtitle NULL, still draft --
 {"ok": true}

-- publish_course again: cover set, subtitle still missing --
 {"ok": false, "error": "missing_subtitle"}

-- update_course: now add subtitle too --
 {"ok": true}

-- publish_course: should now succeed --
 {"ok": true}

-- update_course: clear cover on the now-published draft-course --
 {"ok": false, "error": "missing_cover"}

-- update_course: clear subtitle on the published-course --
 {"ok": false, "error": "missing_subtitle"}

-- update_course: subtitle over 200 chars --
 {"ok": false, "error": "subtitle_too_long"}

-- direct UPDATE as postgres (bypassing the RPCs), publishing a course with no cover --
 ERROR: new row for relation "courses" violates check constraint
 "courses_published_requires_catalogue_fields"

-- direct UPDATE: subtitle over 200 chars, bypassing the RPC --
 ERROR: new row for relation "courses" violates check constraint
 "courses_subtitle_length_check"
```

Every line the owner's plan-approval asked for is covered: anon reads a
published course's summary/cover; anon sees no draft course; `publish_course`
without cover → `missing_cover`; without subtitle → `missing_subtitle`; a
direct `UPDATE status='published'` with no cover → CHECK violation; clearing
the cover on a published course via `update_course` → clean error; subtitle
over the cap → refused, both through the RPC and directly against the table.

`npm run check`, `npm test` (474 passed) both clean after every code change
in this card.
