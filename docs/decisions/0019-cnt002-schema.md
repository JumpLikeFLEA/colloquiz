# 0019 — CNT-002 schema migration: decisions made unattended

## Context

CNT-002 (issue #67) implements docs/decisions/0018-alliengll-content-model.md
Decisions 2, 4 and 6 as migration `041_alliengll_schema.sql`, run under
`work on next --no-approval`. 0018 settles the shape at a level of detail
that left several concrete choices open. This file records those, per the
working agreement's "any decision made during the work goes into
`docs/decisions/`" rule.

## Decision 1 — `publish_lesson` takes the item count as a parameter, not by introspecting the document

0018 Decision 2 says the lesson document's exact block shape (theory vs.
practice, the discriminator between them) is "the validator card's decision,
recorded in its own file" — CNT-003, not yet built at the time CNT-002 was
worked. `publish_lesson` needs a practice-item count to write
`published_item_count`, but computing that by inspecting `document` would
require guessing at a field shape 0018 explicitly defers.

**Decision:** `publish_lesson(p_lesson_id, p_item_count)` takes the count as
an explicit parameter. The caller — a future server route, once CNT-003
exists — runs the CNT-003 validator, which already computes the practice
block count as a side effect of validating, and passes that number through.
This mirrors the existing "API route validates (zod + KaTeX), RPC does a
structural backstop only" split `save_stage_theory` used for Colloquiz
course theory (029).

**What would make us revisit it:** CNT-003 lands with a block shape simple
enough that a generic SQL count (e.g., "count array elements where
`kind = 'practice'`") would be safe to hard-code, and the parameter starts
to look like redundant plumbing instead of a genuine boundary. At that point
either keep the parameter (defence in depth: the route's count and the DB's
count would then agree by construction, catching a route-side bug) or drop
it — a real trade to make with CNT-003's actual shape in hand, not before.

## Decision 2 — an unpublished lesson's metadata is invisible to non-editors, not just its content

0018 doesn't say this in as many words. The handoff's "title, description
and item count are visible for every lesson, including paid ones" is written
contrasting free vs. paid, not draft vs. published — Decision 4 ("a lesson
is playable when it has a `published_version_id`") is the governing clause
for draft state, and the existing "courses: published read" policy already
establishes the precedent that a draft (course) is invisible to non-editors
entirely, not merely unplayable.

**Decision:** the "lessons: published read" RLS policy requires
`published_version_id IS NOT NULL` in addition to the course being
published. A draft lesson inside an already-published course is invisible
to anon/non-buyer/buyer alike — only `can_edit_course` grants visibility.
Verified as one of the twelve cells in CNT-002's full verification protocol
(migration 041 header; scratch verification script, not committed, ran
against seeded local data).

**What would make us revisit it:** a product requirement that a course's
lesson *count* (not content) be visible before every lesson is published —
e.g., a syllabus preview showing "Lesson 4: [coming soon]". Nothing in
`docs/handoff.md` asks for this; if it's wanted later, it's an additive
change to the same policy.

## Decision 3 — `courses.author_id` is nullable, not `NOT NULL`

0018 Decision 1 lists `author_id` as added ("content carries an author id
from day one") but doesn't state a nullability constraint, and no
course-creation RPC exists yet in this card's scope — CNT-002 only reshapes
the table. A `NOT NULL` constraint with no writer that could satisfy it
would be untested by anything this migration actually does.

**Decision:** nullable for now. Whichever future card adds the first
course-creation write path (an authoring RPC, or CNT-004's importer) is
where `NOT NULL` becomes provable and should be added then.

## Decision 4 — `course_entitlements.source` allows `'purchase' | 'grant'`, not `course_enrollments`'s `'self' | 'purchase' | 'grant'`

`course_enrollments` (028, dropped by 039) allowed `'self'` because
Colloquiz courses supported free self-enrollment. Alliengll has no
self-enrollment path for paid content — a course_entitlements row is
created only by M3's merchant-of-record webhook (`'purchase'`) or an admin
comping access (`'grant'`). `'self'` would be a value nothing can ever
legitimately write.

**What would make us revisit it:** M3 finding a need for a third source
(e.g. a promotional code redemption distinct from both). Additive: widen
the CHECK constraint.

## Decision 5 — `create_lesson` RPC, not named in the CNT-002 acceptance list

The acceptance line "creating a course's first lesson writes
`in_free_sample = true`... nothing derives it from ordinal" requires
*something* to decide "is this the first lesson" at INSERT time, and
`lessons` has no direct INSERT grant to `authenticated` (house style: writes
go through `SECURITY DEFINER` RPCs, matching every other authored table in
this schema). `create_lesson(p_course_id, p_title, p_description)` is that
RPC. It locks the owning `courses` row `FOR UPDATE` before counting existing
lessons, so two concurrent creates for the same course can't both observe
zero lessons and both set `in_free_sample = true`.

Any future writer that inserts into `lessons` directly (e.g. a bulk importer
using the service role, which bypasses this RPC and its lock) must
replicate the same "first lesson only" rule itself — this migration cannot
enforce it structurally without either a trigger (rejected: the whole
point of the RPC-only-write house style is keeping business logic in one
audited place, not scattered into triggers) or making `lessons` itself
un-writable outside this function (already true for `authenticated`/`anon`;
the service role bypasses grants entirely by design).

## Decision 6 — lesson-image bucket: `lesson-images`, 5 MB, PNG/JPEG/WebP

0018 says "limits are declared in one `lib/` constant and enforced again on
the bucket (the avatar precedent)" but not the actual numbers. Avatars use
2 MB; lesson diagrams and screenshots run larger, so 5 MB was chosen as a
round increase, same MIME set as avatars (no format need identified beyond
raster images). Declared once in `lib/lessonImages.ts` and on the bucket
(migration 041), matching the avatars split exactly (`lib/avatar.ts` +
migration 022).

**What would make us revisit it:** an actual authored lesson image (once
the partner sends a real PDF, per 0018's open drafting-prompt item) that
doesn't fit 5 MB, or a format need (SVG diagrams) outside the three raster
types.
