<!-- Scratch prompt for scoping the M3 board. Delete this file once every M3
     card reaches Done. It is staging, not a durable doc. Supersedes
     claude/m3-backlog.md (the merchant-of-record draft, parked 2026-10-07). -->

# Prompt: fill the board with M3 (first paid cohort)

Paste this into Claude Code in the Colloquiz repo. Put this file at
`prompts/m3-backlog.md` and commit it first, on its own.

**Checkpointed: four phases, three hard stops.** Do NOT run it with
`--no-approval`. Phases 1 and 2 write nothing. Phase 3 writes `backlog.mjs`.
Phase 4 writes to the live board.

M3's bar (handoff, "Milestones"): **the partner runs a four-week cohort with
manually enrolled students, weekly voice tasks with her written feedback, and
the before/after screen.** It also carries the free-funnel changes from the
same spec: Telegram sign-in, lessons that need a sign-in, and learner stats.
Every card is judged against that bar.

Read `docs/handoff.md` in full first, especially "Two product lines",
"Entitlement and access" (cohort exception), "Audience and language", "Item
types" (voice), "Payments" and "Open questions" → "Partner answers
(2026-10-07)". Then read decisions 0018, 0019, 0025, 0037, 0041, 0056, 0068,
0080, 0081 and 0083. **Do not re-open anything they settle.** If a phase-1
finding contradicts them, say so and stop. That is a conversation, not a card.

---

## Settled inputs: not up for re-litigation

1. **Two product lines** (owner, 2026-10-07, committed in `f005e97`). Cohort
   courses unlock lessons by week from the run's start. Voice tasks are a
   third block kind, never an item type, never scored.
2. **Payment happens outside the app** (Patreon or similar). The app records
   manual grants only (`course_entitlements.source = 'grant'`), created
   through invite links. No checkout, no webhook, no provider JS. Only an
   editor or admin revokes access, by hand. The PAY drafts in
   `claude/m3-backlog.md` are parked; do not use them or their keys.
3. **Runs repeat** (partner, 2026-10-07): a cohort course is run again,
   e.g. monthly. A learner may therefore be in more than one run of the same
   course. The first run's start date is not set; the M3 exit is a dry run,
   not a date.
4. **Extended tier** (partner): a calendar-like list of the run's calls,
   each with a time and a Google Meet link, visible only to that run's
   extended-tier learners and to editors. Calls happen outside the app.
5. **Feedback on a voice task** (partner): text she pastes in, shown under
   the recording, with basic formatting — at least bold. No file attachment.
6. **Sign-in on free courses** (partner): she marks which lessons are open
   without sign-in (default: the first). A link to any other lesson shows its
   title and the start of the lesson, asks the learner to sign in, and
   returns them to that same lesson. **The two conflicts recorded under
   "Partner answers" are settled by the owner on CNT-011, and nowhere else**:
   the sign-in wall, and partial content served to a denied visitor.
7. **One authority for access.** Entitlement, access level and schedule are
   all decided in SQL. The UI renders a state the database returns; it never
   computes "open", "sign in" or "opens on <date>" itself.
   `lib/entitlement.ts`, if built, is a mirror only (CLAUDE.md).
8. **The partner is a course editor, not an admin** (0041). Every M3
   partner tool — runs, invites, review queue, learners page — is gated on
   `can_edit_course`, and shows her only learners of courses she edits.
9. **Language.** Lesson chrome is English (0080 Decision 5), and that
   includes the voice recorder. The course page keeps its shared EN/RU
   toggle (`courseCopy.ts`). Authoring and admin chrome are English. New
   learner-facing routes (invite claim, final screen) are covered by assumed
   decision B below.
10. **Budgets.** `/`, a free course's page and a free lesson keep their
    current `npm run budget` figures, byte for byte. Recorder code loads only
    on a lesson that contains a voice block. Telegram sign-in adds nothing to
    an anonymous visitor's critical path.
11. **Migrations** are written, never applied by a session (CLAUDE.md). Any
    migration that touches `can_read_lesson`, `has_course_entitlement`, or
    the `lessons` / `lesson_versions` policies re-runs PLAY-006's
    anonymous-path protocol rows alongside its own matrix. That way, applying
    it before OPS-010 can't silently break the launch path. When to apply is
    the owner's call.
12. **Personal data.** Every new user-keyed table AND every stored file joins
    account export and account deletion. Storage objects are not removed by
    an FK cascade, so deletion has to remove them explicitly.
13. **No new npm dependency without stopping** (CLAUDE.md). The recorder is
    native MediaRecorder. A rich-text editor library is a decision, not a
    default.
14. **M2 stays the active milestone** until it exits. Do not change
    `next-card.mjs`. M3 cards are worked with an explicit `work on <KEY>`.

## Decisions assumed by this prompt (the owner overrides before Phase 1)

- **A. Reminders:** M3 carries one decision card (COH-006): events, wording,
  and how the bot reaches a learner. Build cards are created after it, and
  their milestone is decided then. Reminders are not part of the M3 bar.
- **B. New learner routes** (invite claim, final screen) are English with no
  toggle, matching lesson chrome.
- **C. Voice in a free or anonymous context:** record and listen locally;
  nothing is uploaded.

External dependencies, named rather than carded:
- the owner creates the Telegram bot in BotFather and enters the provider
  config in the Supabase dashboard (ANON-010);
- the partner supplies the first run's start date and call times when she
  has them.

---

## Phase 1: audit the ground, then STOP

Report what EXISTS. Write nothing. Cite a file path, a migration number or
command output for every claim. Label anything without a pointer as an
assumption.

1. **Board.** Paste `node scripts/board/board-status.mjs` verbatim. List every
   open M2 card with its column, and say which of them OPS-010 depends on.
2. **Applied migrations.** CLAUDE.md says "Latest applied: 049" and warns
   that the line goes stale. Re-derive the real number by probing PostgREST
   (as #121's closing comment did) or say you can't and why. State the
   status of 050–053.
3. **The access path as built.** Every SQL function, RLS policy and TS/TSX
   call site that reads `in_free_sample`, `can_read_lesson`,
   `has_course_entitlement` or `course_entitlements`, with migration and line.
   Point to where the lesson page and the course page decide which state to
   render (free / paid notice / not found), and say whether any of them
   decides on its own instead of asking SQL.
4. **Lesson-page states.** Where the paid-lesson notice (`7e230f2`) and
   PLAY-006's "not available" render. Where a sign-in prompt and an "opens on
   <date>" state would go.
5. **Return to the lesson after sign-in.** For every entry point —
   RegistrationOffer, the landing "Log in" link (ANON-014), the account chip
   (SHELL-019), AuthScreen, `/auth/confirm`, `/auth/callback` — does `next`
   survive to the same lesson? Include the cross-browser email-confirmation
   case, and the hosted email-confirmation finding in 0081.
6. **Lesson document.** The block-kind union and parse path
   (`lib/lessons/parseLessonDocument.ts`), how `publish_lesson` counts items,
   how the block editor inserts a block, the preview, and the importer plus
   `docs/instruction_external_LLM_course.txt`. Name every place a third block
   kind has to enter.
7. **Storage.** Every bucket with its policies, size limit and MIME list;
   upload path patterns; where INFRA-002's conversion runs (browser or route
   handler); 0037's deferred deletion; and how account deletion removes
   storage objects today, if at all (avatars).
8. **Admin surface.** `/app/admin/courses/**` and the `can_edit_course` page
   gate (0041). Where a runs page, an invites page, a review queue and a
   learners page would sit, and how the partner navigates to them.
9. **Strings.** How the course-page toggle works (cookie, `courseCopy.ts`),
   where lesson-chrome English strings live, and where `copy.ts` must not be
   imported (handoff: bundle exception).
10. **Account export and deletion.** Which user-keyed tables they cover today,
    including `lesson_attempts` and `signup_acquisitions`.
11. **Budgets.** The current `npm run budget` table. These are the figures
    settled input 10 freezes.
12. **Legal.** The current privacy-policy and terms versions (0083), and what
    they say about recordings, other people seeing a learner's contact
    details, identity providers and paid access.
13. **Sign-in plumbing.** `ProvidersSection` linking, `lib/inAppBrowser.ts`,
    the Google account chooser (0087), and any existing Telegram reference.
14. **`backlog.mjs`.** The M3 entry in `MILESTONES` (it still reads
    "Monetisation"), the EPICS list, and confirmation that every key drafted
    below is unused (ANON-010..012 should be free; ANON-013..015 are taken).

**STOP.** Post the audit and wait.

---

## Phase 2: challenge the draft cards below, then STOP

For each card: keep, merge, split or drop, with one line on why. Flag any
acceptance line that:
- passes on an empty result;
- can't be verified by the printed output it asks for;
- quietly decides something a decision card owns (access levels, teaser
  shape, cohort data model, feedback format, plan, reminders).

Check the dependency graph for cycles and for cards that rewrite
`can_read_lesson` concurrently (CNT-012 and COH-002 are deliberately
serialised). Propose ranks inside 2300–2520. **STOP.**

## Phase 3: write `backlog.mjs`, then STOP

1. In `MILESTONES`, change M3 to:
   `{ key: 'M3', title: 'First paid cohort', goal: 'The partner runs a four-week cohort with manually enrolled students, weekly voice tasks with her written feedback, and the before/after screen.' }`
2. Add two epics:
   - `{ key: 'COH', title: 'Cohort courses', desc: 'Runs, weekly unlocks, enrolment by invite, tiers, calls, the final screen.' }`
   - `{ key: 'VOICE', title: 'Voice tasks', desc: 'The voice block, recording, submissions, the partner\'s feedback and review queue.' }`
3. Add the agreed cards in the existing shape (`key`, `title`,
   `milestone: 'M3'`, `epic`, `type`, `rank`, `dependsOn`, `goal`,
   `acceptance[]`, `notes`).

Show the diff and run `npm run check`. Commit as "Add M3 (first paid cohort)
to backlog.mjs". **STOP.**

## Phase 4: bootstrap the board (ASK FIRST)

Run `node scripts/board/bootstrap-board.mjs`, then `board-status.mjs`, and
paste both outputs verbatim. Confirm with `next-card.mjs` that the pick is
still an M2 card (settled input 14).

---

## Draft cards

Budgets: every card that touches an English route states its budget and
pastes `npm run budget` before and after. **"Full protocol"** means seeded
rows, every caller × content cell printed, and a check against an empty
table counted as a failure.

### A: Decisions and spikes (no dependencies; can run in parallel)

**COH-001 · type:decision · Cohort data model and unlock rule**
- deps: none
- Where enrolment lives:
  - (a) `run_id` + `tier` columns on `course_entitlements`;
  - (b) a `run_enrolments (run_id, user_id, tier, …)` table, with access
    still granted by a course-level `grant` row.
  - Settled input 3 decides the test case: with (a), the `(user_id,
    course_id)` key allows one run per learner per course, so joining a
    later run would overwrite the first. Say what each option does to that
    learner's earlier submissions, final screen and roster history.
- The unlock rule:
  - absolute from the run's `starts_at`: week N opens at `starts_at + 7·(N−1)`
    days;
  - a late joiner sees every past week at once;
  - a learner in two runs gets a lesson that is open in ANY of their runs;
  - after the run, everything stays open (purchasers keep access).
- `lessons.week` (nullable; required for a cohort course at publish),
  `courses.format` (`self_paced | cohort`), and whether a cohort course can
  also have public or registered lessons (a taster).
- Calls (settled input 4): a per-run list with `starts_at`, a Meet URL and an
  optional title. Who can read the URL. Display in the learner's local time
  with the zone named.
- What a non-enrolled visitor sees on a cohort course page. Optional: an
  external "how to join" link per course (e.g. the Patreon product) — a plain
  link, no provider JS (settled input 2).
- Where the state the UI renders comes from (settled input 7): one function
  returning e.g. `open | sign_in | not_entitled | opens_at(ts)` per lesson for
  the caller.
- Output: a decision file, a schema sketch, and the protocol matrix COH-002
  must print.

**CNT-011 · type:decision · Lesson access levels and the sign-in prompt
(owner settles)**
- deps: none
- Replace the `in_free_sample` boolean with three levels: open to anyone /
  needs sign-in / needs entitlement. Give the column and value names (the
  handoff: "name it so nobody mistakes it for a lock"). The migration mapping
  must not change behaviour: `true → open`, `false → entitlement`.
- **Conflict 1, for the owner:** a sign-in wall in front of some lessons vs
  "no signup wall; registration is offered only after a completed lesson".
  Lay out the scope options: free courses only; never the entry lesson of a
  Telegram post; default open lesson = first.
- **Conflict 2, for the owner:** "the start of the lesson" for a denied
  visitor. Options:
  - (a) title + description only (today's paid-preview shape);
  - (b) the leading theory blocks up to the first practice block, returned
    by a SECURITY DEFINER function under the same access rule;
  - (c) an author-marked teaser boundary.
  - For every option, answer keys and practice payloads never reach a
    denied client. State how this coexists with "partial play of paid
    lessons is NOT built": does a teaser exist for `entitlement` lessons, or
    for sign-in lessons only?
- Return-to-lesson after sign-in for every path in audit item 5. Anonymous
  progress on open lessons still migrates (ANON-004/013).
- Output: a decision file plus the handoff delta text for the owner to
  commit.

**VOICE-001 · spike · Recording and playback on real devices**
- deps: none. If OPS-007 is still open, share its device session.
- A throwaway recorder page behind the admin gate. It is never imported by
  an English route, and it is deleted or kept-and-gated at the end; say
  which.
- Matrix — iOS Safari, Android Chrome, desktop Chrome and Safari, Instagram
  in-app (iOS, Android), Telegram in-app (iOS, Android):
  - does `getUserMedia` get permission;
  - is MediaRecorder present, and what does `isTypeSupported` return (print
    the list);
  - the MIME actually produced;
  - whether `audioBitsPerSecond` is honoured, and bytes per minute at the
    chosen rate;
  - what happens on screen lock or app switch mid-recording.
- Cross-playback: every produced file played on every device, including the
  partner's own phone (no transcoding on Vercel — the playback matrix
  decides which formats are acceptable).
- Recorded as tables in a decision file. Recommendations: accepted MIME list,
  bitrate, max duration, the bucket size limit, and the in-app-browser
  fallback (e.g. an "open in your browser" notice). Every failure becomes a
  proposed card.

**VOICE-002 · type:decision · Feedback text: storage shape and paste**
- deps: none
- Settled input 5: pasted text, at least bold. Options:
  - (a) structured paragraphs of runs with a strong mark, like
    `InlineContent` (`lib/lessons/inline.ts`). Widening `INLINE_MARKS` is
    itself a decision (0020/0022): say whether feedback gets its own type
    instead;
  - (b) a light-markup string (`**bold**`) rendered by a KaTeX-free renderer.
- Paste from Google Docs: whether clipboard HTML is parsed into runs. Docs
  wraps everything in `<b style="font-weight:normal">`, so `<b>` alone is not
  bold — show the fixture. Or plain-text paste plus a bold button.
- No rich-text library unless the owner says so (settled input 13).
- The same shape is used for the final-screen comment (COH-005).

**ANON-010 · spike · Telegram sign-in through OIDC + a Supabase custom
provider**
- deps: none. External: the owner creates the bot and enters the dashboard
  config.
- Telegram's OIDC login (`oauth.telegram.org`, discovery, Authorization Code
  + PKCE, client id/secret via BotFather) through hosted Supabase's custom
  provider (`custom:telegram`, `email_optional: true`). Sources:
  core.telegram.org/bots/telegram-login and
  supabase.com/docs/guides/auth/custom-oauth-providers — re-read both; don't
  rely on this summary.
- Demonstrated and printed:
  - sign-in on desktop, and inside Telegram's and Instagram's in-app browsers
    on iOS and Android (does it hand off to the Telegram app and come back?);
  - the claims that land in `auth.identities.identity_data` (is
    `preferred_username` there?);
  - whether the `telegram:bot_access` scope can be requested through the
    custom provider, and whether the bot can then message that user (input
    for COH-006).
- An email-less account through: ANON-009's acquisition write, account
  export and deletion, terms acceptance, the 60 s new-account window in
  `/auth/callback`, and `ProvidersSection` linking (an email user adds
  Telegram, and the reverse).
- Output: go/no-go, plus the exact config steps as a decision file.

**OPS-018 · type:decision · Supabase plan before the first paid cohort**
- deps: VOICE-001 (measured bytes)
- Facts with sources:
  - Free-plan pause behaviour (0076);
  - backup and restore on Free vs the next plan;
  - storage and egress growth projected from VOICE-001's bytes per learner;
  - cost.
- The owner decides. Record what would trigger revisiting.

### B: Schema and the single access function (serialised)

**CNT-012 · Migration: access levels in the access function**
- deps: CNT-011
- The levels and the mapping CNT-011 chose; `can_read_lesson`, the policies
  from audit item 3, and the state function (settled input 7) all respect
  them. The teaser function, if CNT-011 chose one.
- Before/after counts per level printed: no lesson changes behaviour on
  migration.
- Full protocol: anon / signed-in / entitled / editor × open / sign-in /
  entitlement / draft / archived, plus PLAY-006's anonymous-path rows
  (settled input 11).

**COH-002 · Migration: cohort schema and the schedule branch**
- deps: COH-001, CNT-012
- What COH-001 chose: runs, weeks, enrolment and tier, calls,
  `courses.format`. The schedule branch inside the access function; the
  state function returns `opens_at`.
- Full protocol, seeded with a run whose start is in the past so some weeks
  are open and some aren't. Callers: anon, signed-in non-enrolled, basic
  enrolled before and after unlock, extended enrolled, a learner in two runs,
  editor. Content: open-week lesson, future-week lesson, a call URL. Every
  cell printed.

**AUTH-009 · Editor: per-lesson access level**
- deps: CNT-012
- Replaces the free-sample toggle with the three levels, plus a course-level
  summary of which lessons are open to anyone. The editor's preview shows
  each lesson as anon, a signed-in learner and an entitled learner would see
  it. Authoring chrome stays English.

**AUTH-010 · Cohort authoring: format, weeks, runs, calls**
- deps: COH-002
- An editor can:
  - set a course's format;
  - set each lesson's week (required at publish for a cohort course);
  - create, edit and close runs (start date and time);
  - add, edit and delete calls on a run, including a "repeat weekly ×N"
    helper.
- Every write is an RPC gated on `can_edit_course`; a non-editor's denial is
  printed.

### C: Learner surfaces

**COH-003 · Invite links: create, claim, revoke**
- deps: COH-002
- An editor creates an invite for a run + tier, with a name and a contact
  label (email or @telegram), and gets a one-time link. Tokens are hashed
  and rate-limited, as in 049/0066.
- The claim page (English, assumed decision B): sign in by any method, and
  return to the claim afterwards (audit item 5 paths). The claim RPC writes
  the grant and the enrolment atomically, and then the learner lands on the
  course page.
- Expired, used and revoked states each have a page. Revoking an enrolment
  revokes its grant (settled input 2); it never touches a grant it didn't
  create.
- Contact labels are readable by editors only.
- Full protocol, including a second claim of the same link by another
  account, and an editor of course A acting on course B.

**COH-004 · Cohort course page and the schedule states**
- deps: COH-002
- Lessons are grouped by week, with "opens on <date>" in the learner's local
  time. A direct link to a not-yet-open lesson shows the same state on the
  lesson page. Every state comes from the state function (settled input 7).
- For an extended-tier learner: the run's calls, with the next one first and
  a Join link; nothing about calls for a basic learner. A non-enrolled
  visitor sees what COH-001 decided.
- Copy goes through `courseCopy.ts` and its EN/RU toggle; lesson chrome stays
  English.
- Budgets printed; free routes unchanged (settled input 10).

**ANON-011 · Sign-in prompt on sign-in lessons, and return to the lesson**
- deps: CNT-012
- A denied sign-in lesson renders the CNT-011 shape (title, description, the
  teaser if chosen) plus a sign-in prompt. After signing in by any path, the
  learner is on the same lesson, including after cross-browser email
  confirmation.
- Anonymous progress from open lessons still migrates. Lesson chrome stays
  English. Budgets printed; an open lesson's budget is unchanged.

### D: Voice

**VOICE-003 · The voice block in the lesson document and editor**
- deps: VOICE-001 (defaults)
- A third block kind, e.g. `{ kind: 'task', type: 'voice', id, prompt,
  maxSeconds, compare?: 'before' | 'after' }`, parsed in `lib/lessons` under
  vitest. Item count, lesson score and completion are unaffected (tests).
- At most one `before` and one `after` per course, enforced at publish.
- The editor can insert it anywhere; the preview shows a placeholder
  recorder. The importer and `instruction_external_LLM_course.txt` know the
  block.
- Content export stays readable: the block has a plain-text rendering.

**VOICE-004 · Migration: submissions, feedback and the voice bucket**
- deps: COH-002, VOICE-002, VOICE-003
- A private bucket with VOICE-001's size limit and MIME list; path
  `{course}/{user}/{submission}.{ext}`.
- Storage RLS: a learner inserts and reads only under their own prefix; an
  editor of the course reads; nobody else.
- The submit RPC checks: the block exists in the published version and is a
  voice block, and the caller is entitled with the lesson open. Re-sending
  supersedes the previous submission until feedback is published; after
  that the block is locked.
- Feedback (VOICE-002's shape): written only by `can_edit_course`; a
  learner reads their own feedback once it is published.
- Export lists the submissions and feedback. Deletion removes the rows AND
  the objects (settled input 12), shown on a seeded account by listing the
  bucket before and after.
- Full protocol: owner / another learner / editor / editor of another
  course / anon × read audio, read feedback, write feedback, submit to a
  locked block.

**VOICE-005 · Recorder and feedback in the lesson player**
- deps: VOICE-004
- Record → listen → re-record → send. The upload happens only on send, with
  progress and retry. The recorder is English lesson chrome.
- States:
  - entitled: can send;
  - sent: playback of own recording plus "waiting for feedback";
  - feedback published: shown under the recording;
  - free or anonymous context: local-only practice (assumed decision C);
  - in-app browser: VOICE-001's fallback.
- Recorder code loads only on lessons with a voice block. Budgets printed;
  a lesson without a voice block is unchanged.
- Demonstrated on the VOICE-001 devices that passed.

**VOICE-006 · Review queue for the partner**
- deps: VOICE-004
- Per run and week: submissions without published feedback, oldest first,
  with the audio player and the VOICE-002 editor. Save a draft, publish, and
  edit after publishing (the learner sees the latest version).
- Status per learner and week. Gated on `can_edit_course`. English chrome.

**COH-005 · Final screen: before / after and the final comment**
- deps: VOICE-005, COH-003
- For an enrolled learner of a run: the `before` and `after` recordings side
  by side, plus the partner's final comment (VOICE-002's shape, written from
  the review queue or the learners page).
- Each state has a defined render: before missing, after missing, comment
  not yet published. English (assumed decision B).
- Readable only by the learner and course editors (full protocol).

### E: Learners and identity

**PROG-001 · Per-learner lesson opens**
- deps: none
- A signed-in learner opening a lesson records `(user, lesson, first_opened,
  last_opened)`. Nothing is recorded for anon (funnel events stay
  anonymous, 0069).
- Joins export and deletion. Budget printed; no new client JS on the free
  path unless measured and justified.

**AUTH-011 · Learners page: roster and stats**
- deps: COH-003, VOICE-004, PROG-001
- One SECURITY DEFINER RPC returning only learners of courses the caller
  edits. Columns:
  - contacts: email from `auth.users`; Telegram username once ANON-012
    exists; the invite's contact label;
  - acquisition course + channel (`signup_acquisitions`, 053);
  - run and tier;
  - lessons opened and completed;
  - last activity;
  - voices sent and voices answered.
- Filters: course, run. English chrome.
- Full protocol: a non-editor gets zero rows, and an editor of course A sees
  no learner who only touched course B — both on seeded data.

**ANON-012 · Telegram sign-in button**
- deps: ANON-010 (go)
- On the English sign-in paths, AuthScreen, and `ProvidersSection` linking.
  It is shown or hidden per in-app browser according to ANON-010's results,
  next to the Google rule (0068 D7).
- `next` and acquisition are preserved (audit item 5, 0081).
- No change to an anonymous visitor's critical-path JS (settled input 10).

**COH-006 · type:decision · Telegram bot notifications (assumed decision A)**
- deps: ANON-010
- Which events ("week N is open", "your feedback is ready", others), the
  wording, and how the bot reaches a learner (`telegram:bot_access` vs a
  /start deep link), with the opt-in and opt-out.
- Scheduling for "week N is open": a cron job vs computed at send time.
- Output: a decision file and proposed build cards, with the milestone left
  to the owner.

### F: Ops

**OPS-019 · Legal copy for M3**
- deps: VOICE-004, AUTH-011, ANON-012, COH-003
- Privacy:
  - voice recordings (what, why, who hears them, retention);
  - the course author sees a learner's contacts, activity and acquisition;
  - Telegram as an identity provider (sub-processors);
  - invite contact labels.
- Terms: paid access is granted manually after payment made outside the app,
  and revoked on a refund or chargeback.
- Version bump per 0083. The Russian-version question is answered or
  recorded as still open.

**OPS-020 · Cohort dry run on production (M3 exit)**
- deps: every card above except COH-006, plus OPS-018 decided
- On production, with test accounts on real phones:
  - create a run whose start is in the past, so weeks 1–2 are open and
    week 3 shows its date;
  - invite one basic and one extended learner, and claim inside Telegram's
    in-app browser and in Safari;
  - record and send from iOS and Android;
  - the partner reviews on her own device;
  - feedback appears; the extended learner sees the next call; the final
    screen shows before/after;
  - the learners page shows all of it;
  - revoke one learner and their access is gone.
- Every row involved is printed. The production `npm run budget` table is
  pasted, and free routes are unchanged from their M2 figures.

---

## `docs/handoff.md` deltas

None before Phase 1. Each decision card above (COH-001, CNT-011, VOICE-002,
OPS-018, COH-006) ends with the delta text for the owner to commit, in the
same style as the 2026-10-07 commit.
