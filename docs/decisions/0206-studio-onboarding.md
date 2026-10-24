# 0206 — Studio onboarding: a get-started checklist and a Guide

Date: 2026-10-24. Owner interview (grill-me), this session. Cards: TCH-015, TCH-016.

## Context

A teacher who gets an author seat (TCH-007, 0154) and signs in with no `next`
lands on `/studio` (`lib/studioEditor.ts` counts a seat as an editor; 0117
sends an editor to `/studio`). For a new teacher that page is the inbox's
single empty box, "Nothing needs your attention…"
(`app/(studio)/studio/page.tsx`), which says nothing about where to start.
The admin adds a seat by an existing account's email
(`app/(studio)/studio/authors/SeatsManager.tsx`, "The teacher needs an account
first"), and the app sends no transactional email (docs/ui-decisions.md,
Settings > Notifications entry), so the teacher hears about the seat only from
the admin. Studio has no help page: a grep of `app/(studio)` for
onboarding/welcome/help finds nothing.

The owner's goal: shorten the time from a teacher getting a seat to their
first course. Whether the time actually shortens is not measured (Decision 9).

## Decisions

1. **Finish line: published and shared.** Onboarding is done when the
   teacher has a published course with at least one lesson AND has shared
   something: a student link exists, a student is linked, or a cohort invite
   was claimed. Unlisted is the default for a teacher's course (0171), so a
   course that is published but not shared reaches nobody. Rejected: "created" (says
   almost nothing), "published" alone (unlisted, so unseen), "a student opened
   a lesson" (depends on the teacher's students, not on Studio).
2. **Shape: a checklist plus a Guide.** A "Get started" checklist on the
   inbox, each step ticked from data the database already holds, and a
   permanent `/studio/guide` with one plain-English article per feature.
   Rejected: guide only (the teacher still lands on the empty inbox), a
   tooltip tour (new dependency, fragile across pages and at 360px, gone once
   skipped), a forced wizard (a gate before the workspace, and it needs a
   stored "seen" flag).
3. **Steps.** Core steps, which make up the finish line: create a course (New course,
   or Import from file when `can_import_course()`), add a lesson (at least one
   lesson), publish (course status `published`), invite students (Decision 1's
   "shared"). Extra steps: cover and summary (`cover_image_url` and
   `subtitle` set), lesson access levels (a link to the article, never ticked,
   because the default is a valid choice), assign homework (at least one
   assignment). "Preview it as a learner" is a link and is never ticked:
   nothing records a preview. Owner chose the longer list over five steps. The
   extras stay optional so they don't hold up the finish line.
4. **One focus course.** The course steps follow one course: the first
   published course, else the most recently created draft. The checklist
   names it. It is read through `listAuthoredCourses`
   (`lib/courseAuthoring.ts`), which already returns cover, subtitle, status
   and lessonCount. Rejected: "any course" ticks, which can show a cover
   from one course next to a publish from another.
5. **When it goes.** Once the core steps are ticked, the checklist collapses to
   "You're set up" with the extras left as optional links. It disappears when the
   extras are done or when real inbox items arrive. There is no stored dismissal and no schema
   change. Rejected: staying until every step is done (a teacher who never
   uses homework keeps it for good), and a dismiss button (it needs a profiles
   column and GRANT, or localStorage that comes back on another device).
6. **Who sees it.** Holders of an author seat, the house seat included, while
   the core steps are not all done. Hidden for an admin or a `course_editors`
   grantee with no seat, and while the seat is lapsed (`studio_can_write()`
   false, 0155; the read-only banner already explains that state). The
   partner's existing courses tick the course steps for her, and a claimed
   cohort invite ticks "invite", so a house seat that is already working does
   not see it.
7. **Guide format: a typed data module.** `lib/studioGuide/` holds each
   article as data: slug, title, a one-line "what it's for", numbered steps,
   tips, a "Go there" path and who may see it. One server component renders
   `/studio/guide` and `/studio/guide/[slug]`, with zero client JS and no
   screenshots (they go out of date). Rejected: Markdown files (lib/legalDoc.tsx must
   not become a general engine, and a new renderer or npm dependency is a
   stop), and hand-written TSX per article (no single list for the checklist
   to link to, so the pages drift apart).
8. **Gating.** An article is hidden when the reader can't use the feature:
   Import only with `can_import_course()`; Authors, catalogue listing and
   import grants only for admins. Cohort runs and invites show for everyone,
   because any author can make a cohort course. A guide that describes a button the
   reader doesn't have reads as broken.
9. **Not measured (owner's call).** No "first course N days after seat"
   figure. A measurement would need a published time on courses, which
   `courses` has no column for (`028_courses.sql`). That would be a schema decision.
10. **Entry points.** A "Guide" entry in the Studio sidebar for every Studio
    user, and a "How?" link on every checklist step. Not done: empty-state
    links, and a "?" link on every page header (which would touch about 15
    pages; a card of its own if wanted).
11. **Keeping it true.** A vitest over `lib/studioGuide/` checks that every
    "Go there" path matches a real `app/(studio)` route and that every
    checklist step names an existing article. Plus a CLAUDE.md standing rule:
    a change to a Studio flow updates its article in the same commit, the way
    `docs/ui-decisions.md` is kept.
12. **Arrival.** After "Add seat", `/studio/authors` shows a short
    ready-to-send welcome message with Copy (sign in at colloquiz.app/login,
    you land in Studio, start with the checklist and the Guide). The admin
    sends it through their own channel; no email infrastructure.
13. **Split.** TCH-015 delivers the checklist, the Guide framework, the
    articles the checklist links to, and the welcome text. TCH-016 adds the
    articles for every other feature. The first course isn't held up by articles
    about week three.
14. **Copy.** Plain English: short sentences, one action per step, a
    button's exact label in bold. Pending owner review, approved at the
    card's Verify.

## Revisit when

- Teachers still stall before their first course: consider contextual "?"
  links, or a wizard that creates the course with them.
- The owner wants the time to first course measured: decide where a course's
  first publish time lives (a column or a derivation from lesson_versions).
- The app gains transactional email: send the welcome text from the app
  instead.
- Studio gets a second language: the articles are English, like the rest of
  Studio's chrome.
