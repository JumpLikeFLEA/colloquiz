# 0208 — Studio nav in sections

Ad hoc, owner, 2026-10-26.

## Context

The Studio sidebar (`app/(studio)/studio/StudioSidebar.tsx`) had grown one entry
per card: Inbox, Courses, Imports (import grant only), Reviews, AI feedback,
Learners, Homework, Messages, Calendar, Authors and Costs (admins only), Guide,
then a "Leave Studio" group. Grant-only and admin-only entries were appended to
the shared list, so the list read as random and gave no hint of who sees what.
The admin's catalogue switches (TCH-010, 0171) sat at the bottom of
`/studio/authors`, where the owner could not find them.

Who sees what, from the page gates: every Studio user (`canEnterStudio`) gets
Inbox, Courses, Reviews, AI feedback, Learners, Homework, Messages, Calendar and
Guide. `can_import_course()` adds Imports. `is_admin` adds Authors, Costs and
Colloquiz admin.

## Decisions (owner, in session)

1. **Sections by task and audience.** Inbox, then "Content" (Courses,
   Recordings), "Students" (Learners, Homework, Messages, Calendar), "Admin"
   (admins only: Authors, Catalogue, Costs, Colloquiz admin), then Guide and
   View site. Sign out stays alone in the footer. Labels use the old "Leave
   Studio" label classes. Groups do not collapse, so there is no client state.
2. **Reviews and AI feedback are one entry, "Recordings".** Both pages keep
   their routes (`/studio/reviews`, `/studio/voice`), so inbox links,
   `#final-comments`, pre-filtered links from the course editor and runs page,
   and Guide paths still work. A shared `RecordingsTabs` bar ("Teacher review" |
   "AI feedback") tops both pages, and the entry is active on both. The review
   queue's heading and title are now "Teacher review", and so are its links
   elsewhere in Studio. A full merge into one list was rejected: the two lists
   have different scopes (cohort runs vs. every course) and different filters.
3. **Imports has no nav entry.** The Courses page already had "Import from
   file"; it gains an "Imports" link beside it. Courses is active on
   `/studio/imports/**`.
4. **Catalogue is its own admin page, `/studio/catalogue`.** It holds
   `CourseListingPanel` (moved from `authors/`), which is gone from Authors. The
   course editor's per-course switch is unchanged.
5. **Each badge sits on the entry where the work is done.** The waiting-for-
   feedback count moves from Inbox to Recordings; Messages keeps the unanswered
   count; Inbox has no badge (it is the summary page you land on).
6. **Recordings opens the queue while something waits**, else the AI list
   (`waitingCount > 0`). It uses the count the layout already reads, so there
   is no extra query.
7. **Colloquiz admin is the last Admin item**, with a trailing external-link
   glyph. "View site" keeps its arrow icon.
8. **Ad hoc, no board card.** This file plus a `docs/ui-decisions.md` entry.

Found while measuring, decided unattended: the first build put Guide and View
site in the footer with Sign out. On an 800px-tall phone sheet the three footer
rows pushed the whole Admin section below the fold, so they moved to the end of
the scrolling list (measured below).

## Measured

Hosted project, two throwaway users (an admin, and an editor with one
`course_editors` grant) created through the Admin API and deleted afterwards
(0 profiles and 0 grants left), `npm run dev`, Edge:

- Admin at 1280: the four sections in order; Courses active on
  `/studio/imports`; Recordings active on both tabs; `/studio/authors` has no
  Catalogue heading (0); `/studio/catalogue` 200.
- Editor at 1280: no Admin section, no Imports link on Courses; 404 on
  `/studio/imports`, `/studio/catalogue`, `/studio/authors` and
  `/studio/guide/catalogue-listing`.
- 360px, `scrollWidth/innerWidth` and the `main` scroller: 360/360 on
  `/studio`, `/studio/courses`, `/studio/reviews`, `/studio/voice`, plus
  `/studio/catalogue` and `/studio/authors` for the admin; sheet open: 288px
  wide, document 360/360, content 287/287 wide, admin list scrolls (876/646),
  editor list fits (646/646).

Not reached: Recordings linking to `/studio/reviews` (the hosted waiting count
was 0, so the entry went to `/studio/voice` for both users), a badge in a
browser, toggling a course on `/studio/catalogue` (it would change a real
course's listing; the switch component is unchanged), dark mode.

## Revisit if

- A role gains a section of its own (e.g. a teacher-only group once seats and
  grants diverge further), or Students grows past five entries.
- Teachers report looking for Imports or AI feedback in the nav.
- Recordings' default target confuses a self-paced-only author.
