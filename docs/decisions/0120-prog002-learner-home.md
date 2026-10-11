# 0120 — PROG-002: the learner home at /my

Status: decided while working PROG-002 (#180) under `--no-approval`.
Decision 1 is the owner's (asked in-session, 2026-10-11, as the card's
acceptance requires); the rest were made unattended and are open to
correction.

## Context

0109 Decision 2 puts a learner home on the English surface at `/my`, under
that surface's JS budget, reusing Studio's components but not its shell.
The card asks for the learner's courses with the two progress numbers, the
feedback they received, the next call for an extended enrolee, a sign-in
guard, and an `AccountMenu` link. No access rule may be decided in
TypeScript.

## Decision 1 — chrome language: the saved EN/RU choice, no toggle (owner)

The card required a stop here (docs/handoff.md forbids extending the toggle
without asking). Options put to the owner:

- English, fixed, like the lesson page, `/invite` and `/runs` (0080 D5,
  0107, 0115).
- The saved EN/RU choice, read server-side like the course page, with no
  toggle widget on `/my`.
- Russian, fixed, like the 404 and the error pages.

**The owner chose the saved choice.** `pageLangForPath` (lib/alliengll/
surfaceLang.ts) returns the saved language for `/my`, so `<html lang>` and
the footer follow it too. `/my` has no toggle; a learner changes the
language on `/` or a course page. Strings are in `app/(english)/my/
myCopy.ts`, `{ ru, en }`, Server Components only.

## Decision 2 — no migration: "my courses" is composed from existing reads

There is no SQL function that lists a learner's courses. Writing one would
be a migration, which is a stop under `--no-approval` and wasn't needed:

- **Attempted** courses: `get_course_attempt_summary` (050), called once per
  published course. A `lesson_attempts` embed through `lesson_versions` was
  rejected: "published content read" hides superseded versions, so attempts
  on a republished lesson would vanish (050's header says so).
- **Enrolled**: `run_enrolments` "owner read" (058), non-revoked rows only.
- **Granted**: `course_entitlements` "owner read" (041).

A course is listed only if it is published (`courses` published read); a
grant or enrolment on an unpublished course is dropped, since its page
would 404. Progress per course is `courseProgress` (the course page's own
function) over `getPublicCourse`'s published lessons, so `/my` and the
course page can't show different numbers. Enrolled courses sort first,
then the catalogue's order (`listedCourses`, lib/learnerHome.ts, tested).

Cost: one RPC per published course. The catalogue is 3 courses at most
today (docs/handoff.md, "Launch bar"). A revoked enrolment lists the course
only if something else (an attempt, a grant) does.

## Decision 3 — feedback and calls through the existing read paths

- **Feedback**: `voice_submissions` + `voice_feedback` "owner reads
  published" (060), the lesson page's own read (lib/voiceTaskContext.ts),
  and `run_final_comments` "owner reads published" (061). Both also filter
  `user_id = me` and `published_at IS NOT NULL`, because the "editor read"
  policies on those tables return other learners' rows and drafts to a
  learner who also edits the course. Those filters only drop rows. Shown
  newest first, as text in the learner's feedback box, with a link to the
  lesson (or to `/runs/<run>` for the final comment). The recording itself
  is not replayed on `/my`: that is the lesson page's job, and
  `SignedAudio` would add client JS here.
- **Next call**: `course_calls` (058), only for courses with an extended
  enrolment; `nextCall` drops calls of runs the learner isn't extended in
  (an editor gets every run's calls from SQL, the `callsForAudience`
  reason, 0108 D2) and takes `splitCalls`'s first upcoming one.

## Decision 4 — the guard is in proxy.ts, as for /studio

`/my` joins `isProtectedRoute` (exact path), so a signed-out visitor gets
`/login?next=%2Fmy` before any render: the /studio precedent (0109), and
0049's revisit clause ("its own explicit guard"). The page also redirects
when `getLearnerHome` finds no user, for a session that lapses between the
proxy and the render. `/my` matches no 308 in next.config.ts:
`/my-quizzes/:path*` doesn't match `/my` (checked with curl, below).

Sign-out from `/my`'s account menu returns to `/`, not `/my`, which would
only bounce to the sign-in page.

## Decision 5 — AccountMenu: "My courses" for every signed-in user

A plain `<a href="/my">` first in the card, above "Studio" and "Sign out",
in the Studio link's classes; no client JS (0086). An editor sees it too:
an editor can also be a learner.

## Decision 6 — budget measured signed in

Signed out, `/my` redirects, so a signed-out entry would measure `/login`.
`scripts/budget.ts` gained `signInAs`: it signs a local fixture account in
through the real `/login` form in a throwaway context and carries only the
cookies into the cold measured context (0115's manual method, scripted). It
also now fails any route whose navigation lands on another path, so a
redirect can't pass as a measurement. `scripts/seed-local-fixtures.ts`
seeds `prog002-learner@example.com` with an attempt, an extended enrolment
in the COH-005 run, a call and a published feedback on a purged take, so
every section of `/my` renders when it is measured.

Measured on the local stack (`npm run budget`): `/my` signed in **171.5
KB**, no forbidden-package signature; budgetKB **180** (+~4.5%, the 0057
precedent). The same run with this card's changes stashed (HEAD 0f74795)
printed identical figures for the routes this card could touch: `/` 178.1
KB, `/courses/future-imperfect` 172.0 KB, `/courses/future-imperfect/
true-or-false` 258.3 KB. The `AccountMenu` link is a Server Component `<a>`,
so it adds no client JS; those routes are measured signed out, where the
menu doesn't render at all.

## What would make us revisit this

- The catalogue grows past ~20 published courses, or `/my` gets slow: one
  RPC per course stops being cheap. Then write a `my_courses()` SQL
  function (a migration, owner-applied).
- Learners ask to replay their recordings from `/my` (Decision 3).
- The owner wants a toggle on `/my` itself (Decision 1).
- Learners need to see more than the latest run's tier per course.
