# 0171 — TCH-010: listed courses

Status: built; migration 088 written and applied to the local stack twice, where
`supabase/verify/088_listed_courses.sql` prints `TCH-010 PASS: 088 full protocol
(33 asserted cells)`. Written, not applied to hosted, as the card asks. Decided
unattended under `--no-approval`; each call below is one the owner can overturn.

## Context

docs/decisions/0141 Decision 1: a teacher's courses are unlisted until an admin
promotes one into the public catalogue. Before this card the catalogue read
`status = 'published'` (lib/publicCatalogue.ts), so any teacher's published
course would have appeared on the landing page.

## Decisions

1. **`courses.listed BOOLEAN NOT NULL DEFAULT false`, read with `status =
   'published'`.** The landing catalogue, the hero CTA's course (the first of
   that list) and `/` all read through `getPublishedCourses`, so one filter
   covers the three. A published, unlisted course still opens by its URL:
   `getPublicCourse` reads by slug and RLS is untouched (the verify script reads
   the course and `can_read_lesson` as anon, before and after).
2. **The backfill runs once, guarded by the column's absence.** It sets `listed
   = true` for every course published when 088 first applies, so the catalogue
   does not empty. Re-applying must not re-list a course an admin has unlisted,
   hence the guard (re-apply prints "backfill skipped"). Rejected: a plain
   `UPDATE` in the file, which would undo an admin's choice on every re-apply.
   On the local stack the backfill left `published=4` all `listed` (the table is
   not empty); the hosted counts are printed by the migration's NOTICE and are
   the owner's to paste.
3. **Only a published course can be listed; unlisting is always allowed.**
   `set_course_listed` answers `not_published` otherwise. Admin only (`forbidden`
   for everyone else, an editor of the course included), and it writes no seat
   check because an admin always writes (083). No column GRANT: the column is
   written only by this RPC (verify: a direct `UPDATE` by an admin session is
   refused with 42501).
4. **A new course is unlisted, including an admin's.** The default is false, so
   the partner's own next course will not appear until she (as admin) switches it
   on in the editor. Chosen over "an admin's course lists itself on publish"
   because that is a second rule to explain; the switch is in the course editor
   next to where she publishes. Revisit if this is forgotten in practice.
5. **Homework offers listed or own.** `assign_homework` (re-emitted from 083) and
   `homework_assignable` (from 080) change one line each: `(published AND
   listed) OR the caller edits it`. The files print both diffs against their
   sources. An assignment made before a course is unlisted stays (verify cell);
   the student reader is unchanged.
6. **Admin UI: a "Catalogue" list on `/studio/authors` and a switch in the course
   editor.** Both use `ListedSwitch`; both read `admin_courses_listing()` (admin
   only, raises otherwise). The editor section shows to admins only; a refusal is
   toasted, not predicted client-side beyond disabling the switch for a draft.
7. **Earlier verify scripts changed.** 080 and 081 seeded published courses that a
   teacher does not edit and expected them to be assignable. Their seeds now set
   `listed = true` for those courses. This changes the scripts' fixtures, not an
   assertion; both re-run to PASS, as do 083, 085 and 087.

## Deploy order

Code that filters `listed` returns 500 on `/` against a database without 088
(measured: `npm run budget` against the hosted project, which does not have 088,
printed `/ | FAIL (navigation returned 500)`). Apply 088 to hosted through the gate
BEFORE pushing this code.

## Budget

`npm run budget` on the local stack, `/`: 177.0 KB before, 177.0 KB after (limit
180). The change is a server query filter and two Studio-only components.

## What would make us revisit

The partner forgetting to list her own courses (Decision 4); a need to list by
teacher rather than by course; a catalogue with more than a screenful of courses
(ordering, search).
