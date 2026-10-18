# 0172 — TCH-011: "By <name>" on a teacher's course page

Status: built; migration 089 written and applied to the local stack twice, where
`supabase/verify/089_course_author_name.sql` prints `TCH-011 PASS: 089 full
protocol (12 asserted cells)`. Not applied to hosted. Decided unattended under
`--no-approval`.

## Context

docs/decisions/0141 Decision 20: a non-house teacher's course says whose it is.
`author_seats` has no grants (082), so the course page cannot read a name from it.

## Decisions

1. **One SQL read, `course_author_name(course)`, executable by anon.** SECURITY
   DEFINER; returns only the seat's trimmed `public_name`, so contact, notes,
   expiry and kind never leave it (verify: `author_seats` stays unreadable to
   anon and to a signed-in learner, 42501). The page asks for it in the same
   `Promise.all` as the lesson states, so it adds no serial round trip.
2. **NULL means show nothing.** A house seat, a course with no author, an author
   with no seat, a draft course and an unknown id all return NULL (one verify
   cell each). A draft returns NULL so a name is not public before the course is.
3. **A lapsed seat still names its course.** Authorship is a fact about the
   course, not an entitlement; the freeze (0155) stops writes, not credit.
   Rejected: hiding the name on lapse, which would make a course look authorless
   the day a seat expires.
4. **A failed read shows no line, not an error page.** If 089 is not applied the
   RPC errors; `getPublicCourse` logs it and renders without a name, so the code
   can ship before the migration without taking the course page down (unlike 088,
   0171 "Deploy order").
5. **The line is a plain `<p>` in the hero** between the title and the lead,
   "By <name>" / "Автор: <name>" from `courseCopy`; the catalogue card, the share
   card and the lesson band are unchanged.

## What would make us revisit it

An author wanting a link or avatar on the line; credit on the share card; a
co-author model (`course_editors` beyond `author_id`).
