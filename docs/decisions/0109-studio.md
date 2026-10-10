# 0109 — Studio: the author's workspace

Status: **decided by the owner** (grill-me session, 2026-10-10). Decisions
marked *unattended* were made in the same session without a question and
are open to correction.

## Context

The partner needs one place to:

- maintain course material;
- watch learner progress;
- listen to voice recordings;
- write feedback.

Course creation is not part of this: it stays on the PDF -> JSON ->
`scripts/import-lesson.ts` path.

Today authoring lives at `/app/admin/courses/**` and renders inside the
Colloquiz shell (`app/(colloquiz)/(main)/layout.tsx`: AppSidebar, Topbar,
the duel badge). Two M3 cards were specced to land there as well:

- VOICE-006 (#162, the review queue);
- AUTH-011 (#165, the learners roster).

Neither is built yet, because both are blocked by VOICE-004.

Facts this decision rests on, with pointers:

- The course editor has no dependency on AppSidebar, Topbar or
  `useSidebar` (grep over `app/(colloquiz)/(main)/app/admin/courses`, this
  session). Its only shell-level dependency is `<Toaster />` in
  `app/(colloquiz)/(main)/layout.tsx:144`.
- `proxy.ts` sends signed-out users to sign-in only on `/app` and `/app/*`
  (`proxy.ts:81`, docs/decisions/0049 D3). Every other path is public by
  default, so a protected route outside `/app` needs its own guard.
  `/studio` is not in `next.config.ts`'s 308 segment list.
- Editors read no other learner's data today. These are readable only by
  their own learner:
  - `lesson_attempts` (048:61)
  - `get_course_attempt_summary` (050:65)
  - `signup_acquisitions` (053:52)
  - `lesson_opens` (056:60)
  - `run_enrolments` (058:195)
  - `course_entitlements` (041:182)

  `funnel_events` (051:74-80) has no read path at all. The only learner data
  an editor can read is `run_invites`, through `course_run_invites()`
  (059:325).
- `lesson_attempts` stores `earned`/`possible` per `block_id` per
  `lesson_version_id` (048:43-49). Per-exercise aggregates therefore need no
  new storage.
- What a course author may see is set by the live privacy policy
  (`docs/release/legal/privacy-policy.md:188-195`): email or Telegram
  username, the invite's contact label, how the learner found the course,
  lessons opened and completed, recordings sent and answered, and last
  activity. Scores are not on that list. Line 287 says "nothing else in the
  Service reads another learner's attempts or recordings".

## Decision 1 — Studio first, and the M3 review and roster cards land in it

A new M3 card (SHELL-020) builds the Studio shell and moves the course
editor and runs pages into it. VOICE-006 and AUTH-011 are re-specced to land
in Studio. VOICE-004 blocks both of them anyway, so nothing gets built
twice.

Rejected:

- Shipping M3 as specced and moving later: the queue and roster would be
  built and then moved.
- New work in Studio with the editor left at /app/admin: the partner would
  have two places to go.

## Decision 2 — the shell is author-only, with its own root layout

`app/(studio)/` serves `/studio` and is a root layout, the third alongside
`(colloquiz)` and `(english)`. A future learner home goes on the English
surface (`/my`, PROG-002), under that surface's JS budget, and reuses
Studio's components, not its shell.

Author tooling (the block editor, dnd-kit, the audio review player, Radix
dialogs) has no budget. Learner pages do, and a hard one (docs/handoff.md,
"Performance boundary").

Rejected:

- One shell with nav by role: the whole shell would have to meet the
  English budget, and the chrome language would split.
- `/studio` under the `(english)` layout: Studio would need exceptions to
  `lang="ru"`, the footer gate and the no-ThemeProvider rule.

## Decision 3 — membership: course work only

Anyone with `can_edit_course` (029:74) uses Studio, which means admins and
`course_editors`. All course work moves into it, including the admin-only
create-course and grant-editor actions (0041).

The Colloquiz admin tools stay at `/app/admin`, because they are Colloquiz
and question review needs KaTeX:

- the question review queue;
- the feedback queue;
- the quiz builder;
- the dev playgrounds.

`/app/admin/courses/**` gets a 308 to `/studio/courses/**`. The API routes
under `app/api/admin/courses/**` do not move. Their URLs never appear in the
browser bar, and moving them would only churn every `fetch` call site.

## Decision 4 — three entry points

1. The Colloquiz sidebar's Admin "Courses" entry and the editor-only
   "Course editing" entry point to `/studio`.
2. An editor-only "Studio" link in the English `AccountMenu`. It is
   server-rendered with zero client JS, and a non-editor sees nothing new.
   This doesn't contradict 0062 ("the footer is the only path to `/app`"),
   because Studio is not `/app`.
3. An editor who signs in with `next` absent or equal to `/` lands on
   `/studio`. An explicit deeper `next` (a lesson, an invite) still wins.
   `/` counts because the landing header's "Log in" sends `next=/`, which is
   the path the partner is most likely to use. The rule has to hold on
   every sign-in path: the password sign-in (`lib/authRedirect.ts`
   `authDest()`), OAuth (`app/auth/callback/route.ts:20`), and Telegram once
   ANON-012 lands.

Entry point 3 departs from docs/handoff.md's "signed-in users land on `/`
after login". That line is updated in the commit that builds it
(SHELL-021).

## Decision 5 — home is a "Needs attention" inbox; alerts are a count

`/studio` opens on a cross-course list of what needs doing:

- submissions waiting for feedback, counted per course, run and week, with
  the oldest age;
- feedback drafts that aren't published;
- calls in the next 7 days.

A waiting-count badge sits on the Studio nav. That count is the only author
alert: no push, no Telegram, no email. Recordings arrive weekly, so the
partner can check on her own rhythm. Email would need a mail dependency and
a subprocessor. A Telegram ping would grow COH-006, which is still blocked
by ANON-010.

Until the inbox (AUTH-012) lands, `/studio` redirects to `/studio/courses`
(*unattended*).

## Decision 6 — "homework" is voice tasks and the final comment

These are the only human-reviewed things in the product:

- the weekly voice tasks;
- COH-005's final comment.

Exercises are scored automatically. They are progress, not homework.
`free_text` stays deferred (docs/handoff.md, "Item types").

Rejected:

- A written-answer task: a new block kind and a schema change, which would
  need its own card.
- Reviewing exercise mistakes: this needs item-level responses stored on the
  server, which `lesson_attempts` does not keep, and has a privacy cost.

## Decision 7 — one review queue

`/studio/reviews` is a single queue, filtered by course, run, week and
status. Per-course pages link into it with the filter already set.
VOICE-006's "per run and week" and "status per learner and week" become
views of this one queue. This is the "single entry point" the owner asked
for. Per-course queues would mean another place to check for every new
cohort course.

## Decision 8 — per-learner visibility is what the policy already states

The roster and the learner page show exactly what
`privacy-policy.md:188-195` lists, which is AUTH-011 as specced:

- lessons opened and completed ("completed" means attempted, per
  docs/handoff.md);
- recordings sent and answered;
- last activity;
- acquisition.

No per-learner scores are shown. Adding them would mean a legal revision
with a materiality check under §13 (the OPS-019 precedent), and it would
delay the roster.

## Decision 9 — per-exercise aggregates, hidden below 5 learners

Not per person. Per lesson: opened -> completed counts. Per exercise: the
average score across signed-in learners, from `lesson_attempts` grouped by
`block_id`. An average is shown only when at least 5 distinct learners
attempted that block, so a small cohort can't be re-identified from it.

Anonymous attempts live in localStorage, so the averages cover signed-in
learners only. The page has to say so.

This gets its own M4 card (AUTH-014), together with a change to
`privacy-policy.md:287`, which an aggregate read would make untrue as
worded.

The counts need no threshold, because the author already sees per-learner
opens and completions under Decision 8.

## Decision 10 — English chrome

Studio's chrome is English, the same as the course editor it moves and as
0018 Decision 5. There is no strings module. Feedback text is whatever the
partner writes.

## Decision 11 — app-shell look from existing primitives

Studio gets its own nav, built from the vendored `ui/sidebar`, with the
card, border and brand tokens the course editor already uses. It has no
gradient bands, because it is a workspace, not a pitch. It adds no new
tokens and no new hex literals. SHELL-020 records this in
`docs/ui-decisions.md`.

The nav also carries "View site" (`/`), sign-out, and, for admins only, a
link to `/app/admin` (*unattended*).

The root layout reuses `ThemeProvider` and `Toaster`, as the
`(colloquiz)` layout does (*unattended*). `ui/sonner`'s Toaster reads
`next-themes`, and the editor is already tested under it. The layout gets no
KaTeX CSS, no Vercel Analytics and nothing from the Colloquiz shell.

## Decision 12 — what works on a phone

These work at 360px wide:

- the inbox;
- the review queue (listening and writing feedback);
- the learners page.

The block editor stays desktop-first, as it is today. Making it work at
360px would be a redesign, not a move.

## Decision 13 — recordings: per-learner page, no download

A learner's page lists every recording with its feedback and shows
before/after side by side. Playback uses short-lived signed URLs (VOICE-004).
There is no download button: a copy outside the platform escapes the
6-month purge and the erasure promise (`privacy-policy.md:235, 276`).

## Decision 14 — milestones

**M3** (gates OPS-020, the cohort dry run):

- SHELL-020 the shell and the move;
- SHELL-021 the entry points;
- VOICE-006 the review queue, re-specced;
- AUTH-011 the roster, re-specced;
- AUTH-012 a minimal inbox.

**M4:**

- AUTH-013 the learner page;
- AUTH-014 the course stats;
- PROG-002 the learner home at `/my`.

## Revisit if

- The partner works mainly from a phone and the editor becomes her
  bottleneck at 360px (Decision 12).
- A second author joins and needs to see only their own learners or
  courses. `can_edit_course` already scopes by course, so the trigger here
  is a need for scoping finer than per course.
- Learners need scores shown to the author (Decision 8): that means a legal
  revision first.
- Feedback turnaround slips because the partner doesn't open Studio. Then
  revisit push alerts (Decision 5), through COH-006's bot.
- The learner home (PROG-002) needs more than Studio's list primitives. Then
  reconsider whether the two surfaces should share a shell (Decision 2), and
  measure against the English budget before deciding.
