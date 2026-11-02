# 0215 — Course complete in an anonymous visitor's hero

PROG-010 (#281), worked under `--no-approval`, 2026-11-02. Decided unattended; open to owner review.

## Context

0209 Decision 4 showed the "Course complete" hero state to a signed-in learner only: an anonymous visitor's
progress is known after hydration, and 0179 forbids local progress from moving the layout.

## Decisions

1. **Reserve, don't insert.** For an anonymous visitor on a course whose lessons are ALL open to them, the server
   renders the real pill and the next-course/Share row, `invisible` and `inert` (`AnonymousFinished`,
   `AnonymousProgress.tsx`). After hydration they become visible when `isCourseComplete` (over the same
   `anonAttemptSummary` the Continue CTA uses) says so. Nothing re-derives completion.
2. **Only where finishing is possible.** A course with any lesson not open to the visitor (sign-in, paid, scheduled)
   can never read complete (0209 Decision 1), so it reserves nothing and is byte-for-byte as before.
3. **Cost, accepted:** a visitor on a fully open course gets an empty (invisible) button row under the CTA before
   finishing. 0179 Decision 5 avoided this by omission; this card asks for the reserved-space design. The score
   tiles and in-progress pills stay omitted for anonymous visitors (still not asked for).
4. **Next course** is read by the server for those visitors (`getNextCatalogueCourse`, one query), as for signed-in.

## Measured

Local stack, `next start`, system Edge, 2026-11-02; fixture `future-imperfect` (2 lessons, both open), store seeded
with every exercise answered. Hero height, layout-shift sum and `scrollWidth/innerWidth`, fresh vs finished:
- EN 360: 834 / 834 px, CLS 0 / 0, 360/360 both. EN 1280: 594 / 594, 0 / 0, 1280/1280.
- RU 360: 854 / 854, CLS 0.00015 / 0.00015 (identical fresh and finished, so not from this state), 360/360.
  RU 1280: 654 / 654, 0.00003 / 0.00003, 1280/1280.
- Finished loads show the pill, "Next course: …" and "Share" visible; fresh loads show none.
- `npm run budget` course page, before / after: 176.9 / 177.3 KB of 182 (hosted env; no local course there is fully
  open). `/courses/future-imperfect/true-or-false` reads 260.5 KB of 260 OVER both before and after.
  Signed-in routes could not sign in locally (fixtures missing), as before.
- Not measured: a phone, an in-app browser, dark mode, a cohort course.

## Revisit if

- The empty row on a fresh visit looks like a gap to the owner: move the finished state into the CTA row's own line.
