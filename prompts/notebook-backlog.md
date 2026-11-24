<!-- Scratch prompt for scoping the learner notebook. Delete this file once every
     card it creates reaches Done. Staging, not a durable doc. Written in a chat
     session on 2026-11-24 against commit b5f4896 (migrations through 111,
     decisions through 0234). Layout reference (owner's canvas, private):
     https://claude.ai/artifact/4WqwH5T5snBHowBt2rEZh7 , artboard
     "Notebook, compact (tabs + course filter)". -->

# Prompt: fill the board with the learner notebook

Paste this into Claude Code in the Colloquiz repo. Put this file at
`prompts/notebook-backlog.md` and commit it first, on its own.

**Checkpointed: four phases, three hard stops.** Do NOT run it with
`--no-approval`. Phases 1 and 2 write nothing. Phase 3 writes `backlog.mjs`,
one decision file and one doc delta. Phase 4 writes to the live board.

The bar every card is judged against: **a signed-in learner has one place,
`/my/notebook`, that shows what they can say and what they have saved: phrases
said out loud, fixes, phrases to try, their own notes, the latest AI summary
and a short record of their study. The text outlives the 6-month audio purge.
A linked teacher sees it while the link lasts.**

Read `docs/handoff.md` ("Product thesis", "Scoring and progress",
"Performance boundary", "Audience and language"), `CLAUDE.md` (standing rules,
"The hosted-apply gate") and decisions 0083, 0095, 0120, 0141, 0143, 0156,
0170, 0179, 0186, 0191, 0195, 0209, 0211 and 0229 first. **Do not re-open
anything they settle** unless a settled input below changes it on purpose; if
a phase-1 finding contradicts them in any other way, say so and stop.

---

## Settled inputs: not up for re-litigation

Owner's answers, chat session of 2026-11-24.

1. **Name and place.** "Notebook" / «Блокнот» at `/my/notebook`.
   **Signed-in only**, guarded exactly like `/my` (proxy.ts sends a signed-out
   visitor to `/login?next=/my/notebook`). `/my` and the notebook are never in
   different user states.
2. **What it shows.**
   - **Summary:** the newest recording's AI summary and its next step (or the
     goal, for a first take), copied from the analysis (input 4). No new AI
     call of any kind.
   - **Record:** four numbers that only count up: courses finished
     (`isCourseComplete`, 0209), lessons completed (`lesson_completion()`,
     0143), days with English, recordings sent. No streak, nothing that can
     break, no blended percentage.
   - **Phrases:** expressions the learner said out loud (`expressions_used`,
     with the learner's own quote; `exact: false` is shown as "close"), plus
     the learner's own notes, in one list.
   - **Fixes:** the main error of each recording as "You said / Better".
   - **To try:** listen-for phrases (0186) of the voice tasks in courses the
     learner has started, minus the ones already said. Derived on read, never
     stored.
   - **Recordings:** play and download while the audio exists, each with its
     "kept until" date; after the purge, "audio deleted, notes kept".
3. **Layout: compact.** One list under three tabs (Phrases, Fixes, To try),
   filtered by course chips (All courses + one chip per course with entries).
   NOT grouped by course: a new course adds rows, not sections. Under the
   summary card, the four numbers in one row. Recordings fold into one row
   ("My recordings · N"). "Download notebook" is an icon in the top bar.
   Phrases said out loud and own notes share the Phrases tab and are told
   apart by an icon (microphone / pencil).
4. **Retention: keep the text, delete the audio.** The notebook keeps its own
   copies: the phrase, the learner's quote, the fix (said / better), each
   recording's summary and next step or goal, the date and the course and
   lesson. The analysis row itself (transcript, full result) is purged with
   the audio exactly as today (0195 Decision 2); `voice_mark_removed` keeps
   its current behaviour. The copies stay until the learner deletes them or
   deletes the account.
5. **Visibility.** The notebook is the learner's. A teacher linked to that
   learner (`_teacher_linked`, 076) reads it while the link holds; ending the
   link ends access (the 0170 rule: "A teacher sees your answers and scores
   while you are linked"). A course author who is not the linked teacher
   does not see it.
6. **Own notes.** A learner can add a phrase with an optional note from any
   lesson (text-only courses included) and from the notebook page. The source
   course and lesson are recorded automatically. **How the learner saves from
   inside a lesson is NOT designed here:** PROG-017 is a decision card that
   researches the options; the owner picks.
7. **Signed-out learners.** A phrase saved while signed out is kept in browser
   storage and moves to the account at sign-in, through the same mechanism as
   lesson attempts (ANON-001/004). The notebook itself stays signed-in only
   (input 1); the save confirmation says the notebook opens after sign-in.
   (Owner may still choose to hide saving for signed-out visitors instead.
   PROG-017 states the cost of both.)
8. **Empty state.** An invitation to study and one button, "Choose a course",
   to the catalogue (`/#catalogue`). No starter-lesson logic.
9. **Downloads.** Each recording, by its owner only, and the whole notebook as
   one text file.
10. **Out of scope.** Stickers and achievements, streaks and weekly goals,
    reminders, any new AI call, spaced repetition (handoff, "Deliberately out
    of scope"), a teacher writing into a student's notebook.
11. **This chat project's sessions never write to the repo.** Every
    implementation arrives as a prompt for Claude Code; this file is one.

## Facts the plan rests on (re-check each pointer in Phase 1)

12. **The analysis result shape** is `lib/voice/analysis/schema.ts`:
    `expressions_used[] {expression, quote, exact}`, `errors[]` with
    `correction` and `category`, `main_error` (an index or null), `summary`,
    `how_it_sounds`, `goal` (first takes only), `next_step` and
    `goal_reached` (final and interim). Stored results are read through
    `lib/voice/analysis/parseStored.ts`.
13. **The purge.** Recordings go 6 months after `submitted_at` (self-paced)
    or after the run's `ends_at` (cohort): `voice_purge_due` (094, the
    `INTERVAL '6 months'` lines; 060 for cohort). `voice_mark_removed`
    deletes the analysis in the same statement (0195 Decision 2).
14. **The analysis lifecycle functions**: `voice_analysis_finish` (sets
    `done`), `voice_analysis_fail`, `hide_voice_analysis` (an author hides an
    analysis; hidden rows are not shown as feedback, see
    `toLearnerAnalysisRow` in `lib/voice/analysis/learnerList.ts`),
    `voice_mark_removed`, `submit_voice_recording` (a replaced take is
    deleted).
15. **Listen-for lists** live on the voice-task block (`listenFor`, 0186,
    up to 24 items since commit 081cd0f) and are read through
    `parseLessonDocument`, never from raw JSON. In the authored course files
    (owner's clone, chat 2026-11-24, NOT hosted), 11 courses have a list and
    Future Imperfect and Present Perfect have none: for those two, "To try" is
    empty.
16. **`/my` already lists AI feedback** (up to `LEARNER_ANALYSIS_LIMIT` = 12,
    `lib/voice/analysis/learnerList.ts`; the section in
    `app/(english)/my/page.tsx`) and links each row to its lesson.
17. **Teacher reads.** `_teacher_linked(p_teacher, p_student)` (076:152) is
    revoked from client roles; teacher-side reads go through SECURITY DEFINER
    RPCs.
18. **Export and deletion.** `app/api/account/export` with
    `lib/accountExport.ts`; `my_voice_analyses_export` (VOICE-016); the
    latest `delete_my_account` body is in 109 (re-derive with the print
    rule).
19. **Recordings play through signed URLs** (`lib/voice/storage.ts`,
    `createSignedUrl`).
20. **Time zone.** `TimeZoneSync` writes the `colloquiz_tz` cookie
    (`app/components/calendar/TimeZoneSync.tsx`); without it the server uses
    UTC.
21. **Privacy policy v1.12** says voice transcripts and AI feedback are
    "deleted together with the recording" (retention table,
    `docs/release/legal/privacy-policy.md` around lines 361-362) and that a
    course author reads transcripts and AI feedback (around lines 214 and
    283). Input 4 and input 5 change what it must say.
22. **Board numbers (chat grep, re-derive):** highest keys PROG-010 and
    OPS-042; highest rank 4240; M4 ranks run 2600-3380; latest decision 0234;
    latest migration 111.

## Decisions assumed by this prompt (the owner overrides before Phase 1)

- **A. Milestone M4, epic PROG** (OPS-043 in epic OPS). M5 is active today;
  Phase 1 states what adding open M4 cards does to `next-card.mjs`.
- **B. Copy at completion.** Entries are written when an analysis becomes
  `done`, in the same transaction (inside `voice_analysis_finish` or an AFTER
  UPDATE trigger on `voice_analyses`; PROG-011 picks), idempotent per
  submission. A one-time backfill copies every `done`, non-hidden analysis
  that exists on the day of the hosted apply.
- **C. Hiding removes.** When an author hides an analysis, the entries copied
  from it are removed. If an unhide exists, it copies them again.
- **D. Replacing keeps.** Entries already copied from a take that the learner
  replaces stay: the learner did say it.
- **E. The learner deletes, never edits, copied text.** Any entry can be
  deleted; own notes can also be edited.
- **F. A day with English** is a local date (`colloquiz_tz`, else UTC) with at
  least one `lesson_attempts` row, voice submission or writing submission.
- **G. "To try"** compares phrases trimmed and case-insensitively; PROG-013's
  tests fix the exact rule.
- **H. Notebook text before production.** The migration that starts copying
  (PROG-012) is applied to hosted only after the privacy revision (OPS-043)
  is published (the OPS-026/027 precedent).

---

## Phase 1: audit the ground, then STOP

Report what EXISTS. Write nothing. Cite a file path, a migration number or
command output for every claim.

1. **Board.** Paste `node scripts/board/board-status.mjs` verbatim. Say which
   milestone `next-card.mjs` treats as active, and what it will pick once
   open M4 cards exist again (assumed decision A).
2. **`backlog.mjs`.** Confirm PROG-011 to PROG-020 and OPS-043 are unused;
   print the highest rank and a free rank range inside M4.
3. **Facts 12 to 22.** For each, print the line that supports it today, or
   say it no longer holds.
4. **The analysis lifecycle.** Every function that writes
   `voice_analyses.status` or `hidden_at`, or deletes `voice_analyses` or
   `voice_submissions` rows (completion, failure, hide, unhide if any, purge,
   replacement, account deletion), each with the migration that holds its
   latest body.
5. **The attempts migration path.** Which module stores anonymous attempts,
   which RPC moves them at sign-in, and where a second local store (notes)
   would plug in.
6. **Where links to the notebook would sit:** the `/my` header, the AI
   feedback view in a lesson (`AnalysisResult.tsx`), the course-complete card
   (0209).
7. **`npm run budget`** for `/my` today, printed.
8. **Next decision number:** `ls docs/decisions | tail -1`. Latest migration:
   `ls supabase/migrations | tail -1`.

**STOP.** Post the audit and wait.

## Phase 2: challenge the draft cards below, then STOP

For each card: keep, merge, split or drop, with one line on why. Flag any
acceptance line that:
- passes on an empty result;
- can't be verified by the printed output it asks for;
- quietly decides something a decision card owns (PROG-011, PROG-017).

Check the dependency graph for cycles. Propose ranks in the free M4 range.
**STOP.**

## Phase 3: write the repo files, then STOP

1. The agreed cards in the existing shape (`key`, `title`, `milestone`,
   `epic`, `type`, `rank`, `dependsOn`, `goal`, `acceptance[]`, `notes`).
   Types are `task` or `decision`.
2. `docs/decisions/NNNN-learner-notebook.md`: settled inputs 1 to 11, facts
   12 to 22 with their pointers, assumed decisions A to H marked as assumed,
   and "what would make us revisit this". Number from the print rule, at
   write time and again before commit.
3. A `docs/handoff.md` delta, shown to the owner as a diff and committed only
   on his word: one paragraph after the 0156 exception in "Product thesis":
   "**The notebook (owner, 2026-11-24, decision NNNN).** A signed-in learner's
   notebook keeps the phrases they said, their fixes, the AI summaries and
   their own notes. Its text outlives the 6-month audio purge; the audio and
   the analysis itself do not. It is a record, not a retention mechanic: no
   streaks, goals or reminders come with it."

Show the diff, run `npm run check && npm test`. Commit as "Add the learner
notebook (PROG-011..020, OPS-043) to backlog.mjs". **STOP.**

## Phase 4: bootstrap the board (ASK FIRST)

Check the rate limit. Run `node scripts/board/bootstrap-board.mjs --dry-run`.
Expected: no new milestone, 11 creates (or the Phase 2 count), 0 changes to
existing issues. Then the real run, then `board-status.mjs`. Paste all
outputs verbatim.

---

## Draft cards

Conventions for every card:

- **"Printed"** means command output pasted in the evidence comment. A count
  is copied from output, never typed.
- **A check over zero rows is a FAIL.**
- **Full protocol** (CLAUDE.md) for anything touching RLS, account export or
  deletion; a positive control beside every denial.
- **Budgets:** every card that touches an English route pastes
  `npm run budget` before and after for that route.
- **360px:** every new state is measured (`npm run viewport360`,
  `scrollWidth/innerWidth` printed), EN and RU.

**PROG-011 · decision · Notebook data model, copy rule and retention**
- deps: none
- Options with evidence, one section each:
  - tables: one entries table with a `kind` (said / fix / own) plus a
    summaries table, or another shape; which columns, which limits (phrase
    and note lengths), which indexes;
  - where the copy runs (assumed decision B): inside `voice_analysis_finish`,
    an AFTER UPDATE trigger, or the app pipeline; what each does when the
    copy fails (the analysis must still reach `done`);
  - the backfill: one migration step or a script; how it is re-runnable;
  - hide and unhide (C), replacement (D), learner deletion (E);
  - the teacher read path: one SECURITY DEFINER RPC over `_teacher_linked`
    or a policy; why;
  - the export shape inside the account export;
  - what "To try" reads at request time (published lesson versions of
    courses the learner has started) and its cost per page load.
- Output: decision file; the schema PROG-012 builds; the privacy delta text
  OPS-043 publishes.

**PROG-012 · task · Migration: notebook tables, copy on completion, hide rule,
backfill, export and deletion**
- deps: PROG-011
- Tables as PROG-011 decided. RLS on. The learner reads their own rows. No
  client role can insert a copied kind; own notes are written only through an
  RPC that uses `auth.uid()`. `source_submission_id`, if kept, is
  `ON DELETE SET NULL`, never CASCADE. User FKs to `profiles` are
  `ON DELETE CASCADE`.
- Copy: on a seeded take, finishing its analysis creates the entries; running
  the finish path a second time leaves the counts unchanged (both counts
  printed).
- **Purge leaves the notebook.** `voice_mark_removed` on a seeded take: the
  analysis row is gone AND its notebook rows remain (counts before and after
  printed). Positive control: an untouched take keeps both.
- Hide: hiding a seeded analysis removes exactly its entries; another
  analysis's entries are untouched (printed).
- Teacher: a linked teacher reads the student's notebook; an unlinked
  teacher, a teacher linked to someone else, another learner and `anon` are
  each refused. Positive control beside every denial.
- Export contains the notebook; `delete_my_account` removes it, re-emitted
  from its latest body (print rule). Full protocol on a seeded account.
- Backfill: on the local stack with seeded analyses, the number of done,
  non-hidden analyses before equals the number of copied summaries after.
  The same two counts are printed on hosted at apply time.
- Hosted apply through the gate, and only after OPS-043 is published
  (assumed decision H). Migration-number and re-emitted-body print rule.

**PROG-013 · task · `lib/notebook`: the pure model behind the page**
- deps: PROG-011
- Pure modules under vitest, no database:
  - tabs and the course filter over a learner's entries; counts per tab;
  - "close" from `exact: false`;
  - "To try" = listen-for phrases of started courses minus phrases said in
    that course, by assumed decision G (trimmed, case-insensitive; typographic
    vs straight apostrophes covered);
  - the four record numbers from their inputs; "days with English" in a
    given zone, with a DST-boundary case and the UTC fallback;
  - a recording's "kept until" date, self-paced vs cohort (fact 13), and the
    "audio deleted, notes kept" state;
  - the empty state for each tab and for the whole notebook.

**PROG-014 · task · `/my/notebook`: the compact page and its empty state**
- deps: PROG-012, PROG-013
- A Server Component under `app/(english)/my/notebook/`, guarded like `/my`,
  following the saved EN/RU choice with no toggle of its own. Layout as
  settled input 3.
- Tab and course filter are URL search params (`?tab=&course=`), so they
  cost no client JS (the review-queue precedent). Recordings fold with a
  native `<details>`.
- Summary card: the newest copied summary with its next step or goal, and
  the existing line that AI feedback "can be wrong" and "is not a grade".
- Empty state (settled input 8): invitation and "Choose a course" to
  `/#catalogue`.
- Composes from `surfaceClasses.ts` and existing tokens; no new colour, no
  Recharts. A `docs/ui-decisions.md` entry.
- 360px in every state (empty, each tab, a course filter with an empty tab,
  recordings open, RU); `npm run budget` for `/my/notebook` printed, within
  the `/my` figure from Phase 1 unless PROG-011 sets another.

**PROG-015 · task · Ways in: `/my`, the lesson's AI feedback, course complete**
- deps: PROG-014
- `/my` links to the notebook at the top (with Up next, 0211). The AI
  feedback view in a lesson links to it once the analysis is done. The
  course-complete card (0209) links to it.
- Decide, in the card's decision note, whether `/my`'s "AI feedback on your
  recordings" list stays or moves into the notebook.
- 360px for each changed state; budgets for `/my` and the free lesson.

**PROG-016 · task · Own notes on the notebook page: add, edit, delete**
- deps: PROG-012, PROG-014
- Add a phrase with an optional note from the notebook page; edit and delete
  own notes; delete any copied entry, with a confirmation that names what
  goes.
- Limits from PROG-011, enforced in the RPC and shown in the form.
- Tested: empty phrase, over-length phrase and note, Cyrillic note, a
  duplicate phrase (allowed or merged, as PROG-011 says).
- 360px for the form and its errors; budget printed.

**PROG-017 · decision · Saving a phrase from inside a lesson (spike)**
- deps: PROG-011
- Options, each tried on a throwaway branch and measured on real devices
  (iOS Safari, Android Chrome, the Instagram and Telegram in-app browsers):
  - a notebook button in the lesson's chrome that opens a sheet, filled from
    the current text selection when there is one;
  - an action that appears over selected text;
  - a "save" affordance on specific blocks (theory phrases, the fix in the AI
    feedback, an explanation), and whether it needs authoring;
  - any other option found.
- For each: does it work in each browser (screenshots), does it clash with
  drag items and text inputs in the player, what it adds to the free
  lesson's First Load JS (printed), how a signed-out learner's save behaves
  (settled input 7), and what the cheaper alternative is if the owner
  decides to hide saving for signed-out visitors.
- Output: options with evidence and a recommendation; the owner picks; the
  build card follows from the pick. Nothing from the branch is merged.

**PROG-018 · task · Signed-out notes: local store and the move at sign-in**
- deps: PROG-012, PROG-017
- A versioned local store that never throws and falls back to memory (the
  ANON-002 pattern), tested under `lib/` including an unparseable and an
  old-version payload.
- Moved to the account at sign-in by the mechanism Phase 1 item 5 found;
  shown end to end in the cross-browser case (save in browser A, confirm the
  email in browser B, the note is in B's notebook).
- The save confirmation says the notebook opens after sign-in (EN/RU).

**PROG-019 · task · Downloads: a recording, and the notebook as a file**
- deps: PROG-012, PROG-014
- A recording downloads through a signed URL with a readable filename, for
  its owner only (a teacher or another learner is refused; positive
  control).
- The notebook downloads as one text file built on the server from the
  learner's own rows (format from PROG-011), UTF-8 with Cyrillic intact. The
  formatter is a pure `lib/` module under vitest.
- Recording format is stated next to the button if PROG-011 finds playback
  differs across devices (an Android WebM on an iPhone, for example).

**PROG-020 · task · Studio: a linked student's notebook**
- deps: PROG-012, PROG-013
- On `/studio/learners/[userId]` (0119), a linked teacher sees the student's
  notebook read-only, through the read path PROG-011 chose. An author who is
  not the linked teacher sees nothing (positive control).
- The Studio Guide article for the learner page is updated in the same
  commit (`lib/studioGuide/articles.ts`, 0206 Decision 11).

**OPS-043 · task · Privacy policy: the notebook's retention and the teacher's
view**
- deps: PROG-011
- The privacy policy gains the notebook as its own category: what is copied
  from AI feedback, own notes, who sees it (the learner; a linked teacher
  while linked), how long it is kept (until the learner deletes it or the
  account), export and erasure. The voice rows say the transcript and the
  full feedback still go with the recording.
- Version bump per 0083; whether notice is needed under 0095 is written in
  the evidence.
- The diff is shown to the owner before commit (the ANON-019 precedent).
- Notes: publishing this unblocks PROG-012's hosted apply (assumed
  decision H).
