# 0214 — AUTH-022: duplicate a lesson or a course in Studio

Status: decided unattended (`--no-approval`), 2026-11-02. Migration 107.

## Context

Studio had no way to copy a lesson or a course (issue #272). A teacher who
wants a variant for another level or group rebuilt it by hand. The card asks
for two RPCs and a fix for lesson images: the course delete route purges the
whole `<course_id>/` prefix of `lesson-images` (`app/api/admin/courses/[id]/route.ts`),
so a copy whose documents still name the original's objects loses its images
when the original is deleted.

## Decisions

1. **Two SECURITY DEFINER RPCs** (`supabase/migrations/107_duplicate_lesson_course.sql`):
   `duplicate_lesson(p_lesson_id, p_url_map)` and
   `duplicate_course(p_course_id, p_new_course_id, p_url_map)`. Both call
   `can_edit_course` on the source and `_studio_can_write` (0155). The course
   one also needs what `create_course` (082) needs, an admin or an active seat,
   because it creates a course. A lapsed seat gets `seat_lapsed`.
2. **What is copied:** course title (`"<title> (copy)"`), subtitle, description,
   level, format, join link, cover; lessons that are not archived (title,
   description, minutes, access level, week, order) and each lesson's LATEST
   document as one new `editor` version. The copy is a draft, unlisted, authored
   by the caller, who is its only editor (an admin gets no `course_editors` row,
   as in `create_course`). A lesson copy lands at the end of the same course,
   unpublished.
   **Never copied:** attempts, opens, runs, invites, enrolments, grants,
   homework, voice submissions. The functions do not read those tables;
   `supabase/verify/107_duplicate_lesson_course.sql` seeds an entitlement, an
   open and a run on the original and asserts 0 on the copy.
3. **Images: the route copies the objects, SQL maps the URLs.** SQL cannot copy
   Storage files. The route (`lib/duplicateServer.ts`) reads the documents it
   will copy under the caller's own RLS, plans one copy per image
   (`lib/duplicateImages.ts`, pure and tested), copies the objects with the
   service role into the new course's prefix with new uuid names, and passes
   `{old URL: new URL}` to the RPC, which replaces each URL as a whole JSON
   string in the copied documents and the cover. For a lesson copy the
   prefix is the same course, with new names. A refused or failed RPC removes
   the copies again. Options not taken: leaving the copy pointing at the
   original (the bug the card names); changing the delete route to keep shared
   objects (reference counting across versions is a bigger change than copying).
   The route picks the new course id so the objects can sit under its prefix
   before the row exists; the RPC refuses an id already in use (`id_taken`).
4. **The service role is never steered by a document.** Only objects under the
   SOURCE course's own prefix are planned; a URL naming another course's object,
   a nested path, `.` / `..`, or an external URL is left as it is. The route also
   checks `can_edit_course` and `studio_can_write` for the caller before any byte
   is copied, so a refused caller leaves no orphan objects (the RPC still
   decides).
5. **UI:** a copy icon on each non-archived lesson row and a "Duplicate" button
   under the course slug, both inside `WriteArea` (a frozen seat sees them
   disabled), each opening an AlertDialog that says what is and is not copied;
   success toasts and lands on the copy. Studio Guide article
   `lessons-and-exercises` gains the step and a tip.

## Evidence

- Verify script on the local stack: `AUTH-022 PASS: 107 full protocol (42
  asserted cells)`, run twice; migration applied twice.
- Images, local stack, a script with a real signed-in admin: course copy made 2
  objects (one lesson image, the cover); after purging the original's prefix
  exactly as the DELETE route does, the original returned 400 and the copy's image
  and cover returned 200 with the same bytes; a lesson copy got its own object and
  survived removal of its source's object; a non-editor was refused with 403 before
  anything was copied.
- Hosted (gate, 2026-11-02): probe before showed the 4 new functions absent and every prerequisite present; applied with `db query --linked -f`, recorded with `migration repair --status applied 107` (`migration list` then shows 107/107); grants after: anon none, authenticated execute on the two public functions only. The verify script ran on hosted with no error and left 0 rows (0 `v107%` courses, 0 `@verify.test` users). The hosted run prints no notices, so a copy with one wrong expectation was run too and failed at that assertion (`AUTH-022 FAIL ... got 6, want 99`), proving the clean run executed its assertions.
- 360px and 1280px, see `docs/ui-decisions.md`.

## What would make us revisit it

- A document shape that holds a Storage URL outside `extractLessonImageUrls`'s
  two shapes (theory image, matching image): its object would not be copied and
  would be lost with the original. Add the shape to the extractor.
- Cross-course copy (into another course) would need the target's write check
  and a different prefix rule.
- Copying runs or homework: not wanted by the card; revisit only if teachers ask.
