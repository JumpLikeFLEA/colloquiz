<!-- Scratch prompt for scoping the M6 board. Delete this file once every M6
     card reaches Done. It is staging, not a durable doc. Written in a chat
     session on 2026-11-12 against commit 4208885 (109 migrations, 247 cards).
     The owner's manual steps live in a separate checklist document,
     "Leaving Colloquiz: owner's migration checklist"; its step codes
     (Z, C, H, R, D, F) are quoted in the cards below. -->

# Prompt: fill the board with M6 (separation from Colloquiz)

Paste this into Claude Code in the Colloquiz repo. Put this file at
`prompts/m6-separation-backlog.md` and commit it first, on its own.

**Checkpointed: four phases, three hard stops.** Do NOT run it with
`--no-approval`. Phases 1 and 2 write nothing. Phase 3 writes `backlog.mjs`,
`config.mjs`, one decision file and two doc deltas. Phase 4 writes to the live
board.

M6's bar: **Colloquiz is closed and the English product runs on its own
domain, repo, Supabase project and Vercel project, with every account,
lesson, recording and entitlement intact.** Every card is judged against that
bar.

**There is no date.** The owner starts the milestone only if the English
product goes well. Three cards (MIG-001 to MIG-003) are worth doing now. Every
other card waits behind MIG-004, a decision card that re-audits the repo as it
stands on the day the owner says go. Nothing in this prompt may be treated as
a description of the code on that later day.

Read `docs/handoff.md` ("The two surfaces", "Content ownership",
"Performance boundary"), `CLAUDE.md` ("Stop and ask before anything
irreversible", "The hosted-apply gate") and decisions 0005, 0076, 0083, 0095,
0098, 0109, 0142, 0173, 0181 and 0221 first. **Do not re-open anything they
settle.** If a phase-1 finding contradicts them, say so and stop.

---

## Settled inputs: not up for re-litigation

Owner's answers, chat session of 2026-11-12.

1. **The quiz product is removed completely.** Quick Play, Deep Dive, My
   Quizzes, Groups, Duels, Leaderboard, Achievements, XP, the question bank,
   the generator and the Colloquiz admin tools are not carried along, hidden
   or otherwise. They are archived once and deleted.
2. **Two stages, in this order.**
   - Stage 1, on the current stack: quiz code is removed and shipped, then
     quiz tables are dropped. The site stays on colloquiz.app, English-only.
   - Stage 2: the English-only app is moved like-for-like. "Did everything
     arrive" is then a straight comparison of schema and row counts between
     the old and the new project, with nothing transformed on the way except
     stored addresses.
3. **A new dedicated organisation owns the new home:** a GitHub organisation,
   a Vercel team and a Supabase organisation. Not the owner's personal
   accounts.
4. **Full git history comes along.**
5. **Accounts with no English activity are notified, then erased** at
   closure. Only people who used the English side move.
6. **Name and domain are placeholders:** `NEW-NAME` (working name "Alina
   Cher"; "Alliengll" is the earlier working name and is the bot's username),
   `NEW-DOMAIN`, `NEW-ORG`. No card hardcodes a guess.
7. **The operator is not decided** (the owner personally, as today in Terms
   §1, or a company). It is decided before MIG-022 and nowhere else.
8. **This chat project's sessions never write to the repo.** Every
   implementation arrives as a prompt for Claude Code; this file is one.

## Facts the plan rests on (re-check each pointer in Phase 1)

9. **The Telegram bot cannot be replaced.** The identifier Telegram returns
   at sign-in is issued per bot, not the Telegram account number
   (`docs/decisions/0098`, the claims table; `docs/release/legal/subprocessors.md`,
   Telegram row). A new bot would give every Telegram user a new, empty
   account, and reminder chat ids belong to the bot that received Start
   (0173). The same bot, `@Alliengll_bot`, moves; only its display name,
   description, picture, Web Login allowed URLs and webhook change.
10. **Dashboard-only state exists.** `supabase/templates/` holds
    `confirmation.html` only; the recovery template, the provider config, the
    URL allow-list and the SMTP settings are in the hosted dashboard.
11. **Four buckets:** `avatars`, `lesson-images`, `voice-recordings`,
    `course-imports` (the `BUCKET` constants under `app/` and `lib/`).
    Storage objects are in no database backup on any plan (0142).
12. **Lesson images are addressed by public URL.** `getPublicUrl` is called
    in `app/(studio)/studio/courses/[id]/CourseDetailView.tsx` and
    `.../lessons/[lessonId]/LessonContentEditor.tsx`, and
    `lib/lessonImages.test.ts` parses a full
    `https://<project>.supabase.co/storage/v1/object/public/...` address.
    ASSUMPTION, not yet measured: stored lesson documents and
    `profiles` avatar fields therefore contain the old project host. MIG-004
    measures it.
13. **Four Vercel crons** (`vercel.json`): `voice-purge`,
    `voice-analysis-sweep`, `telegram-reminders`, `course-import-sweep`.
    `.env.example` says the cron routes refuse everything without
    `CRON_SECRET`. A second deployment holding a copy of production data, the
    bot token and the cron secret would send every reminder twice.
14. **Shared pages sit inside the Colloquiz route group:**
    `app/(colloquiz)/(auth)` (login, signup, reset-password) and
    `app/(colloquiz)/(legal)` (terms, privacy, subprocessors). Name, city and
    picture are edited on `/app/settings` (handoff, "The two surfaces").
15. **The app sends no mail of its own.** Resend is SMTP inside Supabase Auth
    (subprocessors.md, Resend row). A notice by email is a manual step for the
    owner.
16. **Terms §10 promises at least 14 days' notice** of a material change, in
    the app or by email (`docs/release/legal/terms-of-service.md`, the
    "at least 14 days" line), and the Terms allow transfer to a successor
    operator with notice.
17. **Old-domain strings in code:** `lib/site.ts` (SITE_URL default,
    SITE_NAME), `lib/calendar/ics.ts` (event UID suffix `@colloquiz.app`),
    `app/api/account/delete/route.ts` (`privacy@colloquiz.app`), the three
    legal files. `git grep -n "Colloquiz" -- app lib ':!*.test.*' | wc -l`
    printed 79 on 2026-11-12.
18. **Free plan, no managed backups** (0142). Destructive work in Stage 1
    therefore needs a backup the owner has restored at least once.

## Decisions assumed by this prompt (the owner overrides before Phase 1)

- **A. Freeze, not zero-downtime.** Moving day uses a short announced
  maintenance window. Dual-writing is not built.
- **B. colloquiz.app redirects path-for-path to NEW-DOMAIN for at least 12
  months.**
- **C. Calendar event UIDs keep their `@colloquiz.app` suffix** as an opaque
  constant, so calendar clients do not duplicate events.
- **D. Stage 2 starts no earlier than 14 days after Stage 1's exit** (MIG-012).
- **E. The repo is transferred into NEW-ORG and renamed** rather than
  recreated blank, so issue numbers cited by commit messages and decision
  files keep resolving. This is a recommendation only; MIG-013 decides it,
  and the owner asked for "a new repo".
- **F. The old Supabase project is paused on moving day and deleted 30 days
  later.** Backups taken before an erasure are destroyed 30 days after it.

External dependencies, named rather than carded: every step in the owner's
checklist (new organisation accounts, domain, DNS, Resend, Google Cloud,
BotFather, plans, the manual notice emails, the partner's links).

---

## Phase 1: audit the ground, then STOP

Report what EXISTS. Write nothing. Cite a file path, a migration number or
command output for every claim. This is a light audit: the heavy one is
MIG-004 and runs later.

1. **Board.** Paste `node scripts/board/board-status.mjs` verbatim. Say which
   milestone `next-card.mjs` treats as active.
2. **`backlog.mjs` and `config.mjs`.** Confirm no `M6`, no `MIG` epic and no
   `MIG-` key exists; print the highest rank in use; print how
   `bootstrap-board.mjs` creates a missing milestone and where its number has
   to be recorded afterwards (`MILESTONE_NUMBERS`, `MILESTONE_TITLES`).
3. **Facts 9 to 18.** For each, print the line that supports it today, or say
   it no longer holds. Fact 12 stays an assumption unless a read-only probe is
   cheap; do not write to hosted.
4. **Next decision number.** `ls docs/decisions | tail -1`.
5. **CLAUDE.md lines that name milestones and key prefixes** ("Milestones:
   M0 ... M4", "Issue keys are epic-prefixed"), with line numbers.

**STOP.** Post the audit and wait.

## Phase 2: challenge the draft cards below, then STOP

For each card: keep, merge, split or drop, with one line on why. Flag any
acceptance line that:
- passes on an empty result;
- can't be verified by the printed output it asks for;
- quietly decides something a decision card owns (MIG-004, MIG-005, MIG-013).

**Keep the keys MIG-001 to MIG-025 as drafted**: the owner's checklist quotes
them. A split adds a new key after MIG-025; a merge leaves a gap.

Check the dependency graph for cycles. Propose ranks inside 4000–4240.
**STOP.**

## Phase 3: write the repo files, then STOP

1. `MILESTONES` gains:
   `{ key: 'M6', title: 'Separation from Colloquiz', goal: 'Colloquiz is closed and the English product runs on its own domain, repo, Supabase project and Vercel project, with every account, lesson, recording and entitlement intact.' }`
2. `EPICS` gains:
   `{ key: 'MIG', title: 'Separation & migration', desc: 'Closing Colloquiz in place, then moving the English product to its own organisation, domain, repo, Supabase project and Vercel project.' }`
3. `config.mjs`: `MILESTONE_TITLES.M6 = 'M6 — Separation from Colloquiz'`.
   `MILESTONE_NUMBERS.M6` is added in Phase 4, after GitHub has assigned it.
4. The agreed cards in the existing shape (`key`, `title`, `milestone: 'M6'`,
   `epic: 'MIG'`, `type`, `rank`, `dependsOn`, `goal`, `acceptance[]`,
   `notes`). Types are `task` or `decision`; there is no third type.
5. `docs/decisions/NNNN-separation-plan.md`: settled inputs 1 to 8, facts 9
   to 18 with their pointers, assumed decisions A to F marked as assumed, and
   "what would make us revisit this". Number from the print rule, at write
   time and again before commit.
6. Doc deltas, shown to the owner as diffs and committed only on his word:
   - `docs/handoff.md`, "The two surfaces": one paragraph, "Planned (owner,
     2026-11-12, decision NNNN): if the English product goes well, Colloquiz
     closes and the English product moves to its own domain and
     organisation. Until MIG-004 is decided, everything in this file stands
     as written."
   - `CLAUDE.md`, the milestones line and the key-prefix line gain M5, M6 and
     `MIG-` (and whatever else Phase 1 found missing there).

Show the diff, run `npm run check && npm test`. Commit as "Add M6 (separation
from Colloquiz) to backlog.mjs". **STOP.**

## Phase 4: bootstrap the board (ASK FIRST)

Check the rate limit. Run `node scripts/board/bootstrap-board.mjs --dry-run`.
Expected: one new milestone, 25 creates (or the Phase 2 count), 0 changes to
existing issues. Then the real run, then record M6's number in
`config.mjs` in its own commit, then `board-status.mjs`. Paste all outputs
verbatim. Confirm with `next-card.mjs` that the pick is unchanged from
Phase 1.

Print, for the owner to run by hand (a session never moves a card into Hold):
`node scripts/board/board-move.mjs MIG-004 Hold`.

---

## Draft cards

Conventions for every card in this milestone:

- **"Printed"** means command output pasted in the evidence comment. A count
  is copied from output, never typed.
- **A comparison over zero objects is a FAIL.**
- **Hosted writes** follow "The hosted-apply gate". A destructive file needs
  the owner's word, per file (gate item 4).
- **Budgets:** every card that touches an English route pastes
  `npm run budget` before and after; no English route may grow.
- **Secrets** are never printed, committed or pasted.

### A: Worth doing now (no dependency on the decision to close)

**MIG-001 · task · Ops inventory: everything that lives outside the repo**
- deps: none
- A new `docs/ops/inventory.md` lists every setting that a clone of the repo
  plus a copy of the database would not carry:
  - Supabase: auth providers, URL configuration, SMTP, email templates, rate
    limits, password and sign-up settings, bucket settings (public flag, size
    limit, MIME list), extensions, `cron.job` rows, the realtime publication,
    API settings, plan and region;
  - Vercel: environment variable NAMES per environment, region, crons,
    Analytics and Speed Insights, domains, plan;
  - BotFather, Google Cloud, Resend, Porkbun DNS, AssemblyAI, Anthropic,
    Discord, the GitHub project board.
- Each line states how it was read: a printed read-only probe
  (`db query --linked`, the Management API, `vercel env ls`), or "owner read
  from the dashboard on <date>" (checklist step Z4). No value of any secret
  appears; names and non-secret settings only.
- Every email template in use is committed under `supabase/templates/`, and
  the file is shown to match hosted (owner-attested if no API reads it).
- Environment names in the inventory are reconciled against
  `rg -o "process\.env\.[A-Z0-9_]+" app lib scripts proxy.ts next.config.ts | sort -u`,
  printed; each name is marked production / local-only / quiz-only.
- Notes: docs only. This file is the input to MIG-019.

**MIG-002 · task · Name, domain and contact address come from one module; a
guard freezes new literals**
- deps: none
- `lib/site.ts` exports the site name, origin and contact address. English,
  Studio and shared code (routes, Telegram texts, calendar, OG images) read
  them from there.
- A `scripts/check-brand-literals.mjs`, run by `npm run check`, fails when a
  file under `app/(english)`, `app/(studio)`, `app/components` or `lib`
  gains a literal `Colloquiz` or `colloquiz.app`. It works like
  `check-hex-literals.mjs`: a recorded per-file baseline that may only
  shrink. Quiz-only files are baselined, not migrated (they are deleted in
  Stage 1).
- Allow-list, each with a comment saying why: the ICS UID suffix (assumed
  decision C), the legal Markdown files, test fixtures.
- Printed: the literal count before and after for the English and Studio
  trees; the guard failing on a deliberately added literal (positive
  control), then passing once it is removed.
- No visible change: `npm run viewport360` on `/` and one lesson, and
  `npm run budget`, before and after.

**MIG-003 · task · A backup that has been restored once**
- deps: none
- `scripts/backup/` holds a documented, re-runnable procedure: a full dump of
  the hosted database (roles, schema, data, following Supabase's current
  documentation, re-read at write time) and a download of every object in
  every bucket. Read-only against hosted.
- Restored into the local stack. Printed: per-table row counts hosted vs
  restored for every table in `public`, `auth.users` and `auth.identities`;
  per-bucket object count and total bytes hosted vs downloaded. Any
  difference is a FAIL; so is a table list of length zero.
- Printed: elapsed time per step, and the size of the backup.
- `docs/ops/backup.md` states where a backup may live, that it is encrypted,
  and when it must be destroyed (it contains personal data; assumed
  decision F). The owner chooses the location (checklist step Z5).
- Notes: this procedure is reused by MIG-010, MIG-011 and MIG-016.

### B: The gate

**MIG-004 · decision · Go, and the fresh audit**
- deps: none. Parked in Hold by the owner until he says go.
- The owner's go is recorded with its date. Then an audit of the repo AS IT
  IS THAT DAY, every claim with a pointer:
  - every route, route handler, lib module, component, script, skill, npm
    dependency, env name, doc and content file classified quiz / English /
    shared, with counts from printed output;
  - every table, view, function, trigger, policy, cron job, bucket and
    `profiles` column classified the same way, from a read-only hosted probe;
    for each shared function, which quiz objects its body touches
    (`delete_my_account`, the export, `handle_new_user` at least);
  - features that sit in the Colloquiz area but are used by English learners
    or authors (tutoring, assignments, groups, notifications, feedback,
    admin pages): named one by one, each marked dies / moves;
  - fact 12 measured: how many stored rows contain the hosted project host
    or `colloquiz.app`, by table and column;
  - each of facts 9 to 18 and assumed decisions A to F: still true, or what
    changed.
- Output: a decision file, the list of differences from this prompt, and an
  amended card list for MIG-005 to MIG-025 for the owner to approve. No card
  after this one starts on the strength of this prompt alone.

### C: Stage 1, close Colloquiz in place

**MIG-005 · decision · Which accounts are quiz-only, and how the closure is
announced (owner settles)**
- deps: MIG-004
- "English activity" is defined as a list of tables and conditions (lesson
  attempts, entitlements and enrolments, teacher links, seats, course
  editing, voice and writing submissions, messages, whatever MIG-004 found).
  One SQL query returns the quiz-only accounts; it is run read-only on hosted
  and the count is printed with the count of accounts that are kept.
- Edge cases, each with a stated answer: admins, the bench account, test
  accounts, unconfirmed sign-ups, accounts created during the notice period,
  an account that is quiz-only on the day of the notice but opens a lesson
  before closing day (it must be kept: the list is re-run on closing day).
- The notice: wording in English and Russian, the channels (in-app, email
  sent by the owner by hand, Telegram for linked users), the period (at least
  14 days, fact 16), what export a quiz user gets.
- Output: decision file, the query, the legal text delta for MIG-007.

**MIG-006 · task · Shared pages leave the Colloquiz route group**
- deps: MIG-004
- Sign-in, sign-up, password reset, the legal pages and the profile fields
  (name, city, picture) live outside `app/(colloquiz)`, with their URLs
  unchanged. Post-sign-in destinations and `proxy.ts` no longer send anyone
  to `/app`.
- Printed: the route table from `next build` before and after (moved routes
  identical); `rg "\(colloquiz\)" app/(english) app/(studio) app/components lib`
  returning nothing; budgets.
- Sign-in by email, Google and Telegram demonstrated on the local stack, plus
  the return-to-lesson path (ANON-016's protocol rows re-run).
- A `docs/ui-decisions.md` entry for the profile fields' new place; measured
  at 360px.

**MIG-007 · task · Closure notice in the app, and the legal revision that
announces it**
- deps: MIG-005
- A notice on the Colloquiz pages with the closing date and a link to the
  data export. Terms and Privacy revised as MIG-005 decided, version bumped,
  `current_terms_version()` re-emitted in a migration
  (`scripts/check-terms-version.mjs` passes).
- The legal diff is shown to the owner at the plan checkpoint, before it is
  committed (the ANON-019 precedent).
- Notes: the email is the owner's step (checklist C5). The 14 days run from
  the push.

**MIG-008 · task · Quiz routes and route handlers removed; `/app` redirects**
- deps: MIG-006, MIG-007, and the owner's word that the notice period is over
- Every quiz page and quiz route handler MIG-004 listed as "dies" is deleted.
  `/app/**` redirects to the page MIG-004 chose.
- Printed: `git diff --stat` summary line; the `next build` route table
  before and after; `npm run check && npm test`; budgets (no English route
  grows); a request to three old `/app` URLs showing the redirect.
- No English or Studio test is deleted: the list of deleted test files is
  printed and each is quiz-only by MIG-004's classification.

**MIG-009 · task · Quiz-only modules, scripts, skills, content and
dependencies removed**
- deps: MIG-008
- FIRST: the question bank is exported to a file outside the repo's tracked
  tree (approved questions with subject, subtopic, difficulty, options,
  answer, explanation), counts printed against a hosted read-only count. It
  is the owner's content and contains no personal data (checklist C10).
- Then: quiz-only `lib/` modules, scripts, `.claude` skills, `data/`,
  `authored/` question files and docs are deleted or rewritten. Each npm
  dependency removed is shown to have zero imports (`rg`, printed).
- `docs/architecture.md`, `README.md`, `docs/setup.md`, `CLAUDE.md` and
  `docs/handoff.md` describe one product. Deltas to `handoff.md` and
  `CLAUDE.md` are shown to the owner before commit.
- Printed: `npm run check && npm test`; `next build`; the env names that are
  now unused (checklist C13).

**MIG-010 · task · Quiz-only accounts erased**
- deps: MIG-005, MIG-008, MIG-003
- The erasure goes through the existing account-erasure path (the latest
  `delete_my_account` body and the storage removal in
  `app/api/account/delete`), driven per account. No second deletion routine
  is written.
- Full protocol on the local stack with seeded accounts: quiz-only,
  English-only, mixed, admin, one that became active after the notice. Only
  the quiz-only one is gone; every other row count is unchanged; its avatar
  object is gone from the bucket (listed before and after).
- On hosted: a fresh backup first (MIG-003); MIG-005's query re-run that day;
  the list shown to the owner; his word; then counts of accounts, of
  `auth.users` and of avatar objects before and after, printed.
- Notes: destructive. Never under `--no-approval`.

**MIG-011 · task · Migrations: quiz tables, functions, policies, columns and
cron jobs dropped**
- deps: MIG-009, MIG-010, MIG-003
- One migration per coherent group, each with a verify script. Functions that
  touched quiz objects are re-emitted from their latest bodies (print rule),
  not from memory. Column GRANTs on `profiles` are re-stated for the columns
  that remain (CLAUDE.md, standing rules).
- Local: `db reset` from zero passes; every earlier verify script for a
  function that was re-emitted or a table that remains prints PASS; account
  export and deletion get the full protocol again.
- Printed before and after, local and hosted: the list of tables, functions,
  policies, triggers, `cron.job` rows and publication tables. After: no
  object MIG-004 classified as quiz remains, and every object classified
  English or shared is still there (count equality, non-zero).
- Hosted apply: after a fresh backup, one file at a time, on the owner's word
  per file.

**MIG-012 · task · Stage 1 exit**
- deps: MIG-011
- Printed: the route table, the hosted object inventory, budgets, bucket
  object counts (orphaned avatars swept, counts before and after), env names
  in use.
- Privacy Policy and Subprocessors no longer describe quiz data or the
  quiz-drafting row; version bump per 0083; whether notice is needed under
  0095 is written in the evidence.
- A schema dump of hosted is stored as the reference for Stage 2.
- The card closes 14 days after MIG-011 reached hosted, with the owner's
  statement that nothing was rolled back (checklist C14).

### D: Stage 2, the move

**MIG-013 · decision · Stage 2 design (owner settles)**
- deps: MIG-012 for the decision; the options may be drafted earlier
- Options with evidence, one section each:
  - the repo: transfer and rename (assumed decision E) or a new repo with
    the history pushed; what each does to issue numbers, to the
    `Closes #n` references, to project board #2 (user-owned today) and to
    `scripts/board/config.mjs`;
  - the database path: Supabase's documented dump and restore, re-read that
    day; how migration history is carried; what the dump does not carry
    (triggers on `auth.users`, storage policies, `cron.job`, the publication,
    extensions, grants);
  - the Google OAuth client: keep it, or a new one under NEW-ORG, with the
    test that proves an existing Google user lands on the same account;
  - anonymous learners: accept the loss with a sign-in nudge during the
    notice period, or build a hand-over page on the old domain; cost of each;
  - assumed decisions A, B, C, D and F, confirmed or changed;
  - where rehearsals run, given the free-project limit (checklist Z7).
- Fact 9 (the bot) is not an option; it is restated.
- Output: decision file; final name, domain and operator recorded if the
  owner has them by then.

**MIG-014 · task · One build runs on either domain by configuration alone**
- deps: MIG-002, MIG-013
- Name, origin, contact address, the Supabase host (CSP, image hosts in
  `next.config.ts`), OG images, Telegram message links, email templates and
  the package name are all driven by configuration or by one constant.
- Printed: a build with the old values, whose rendered `/`, a lesson page and
  a Telegram message fixture are byte-identical to before; a build with
  NEW-NAME and NEW-DOMAIN values, in whose output
  `rg -i "colloquiz"` over the English routes finds only the allow-listed UID
  constant.
- Budgets unchanged.

**MIG-015 · task · Maintenance switch and write freeze**
- deps: MIG-013
- One switch puts the site into maintenance: a short page in English and
  Russian, every write path refused, every cron route a no-op.
- The browser talks to Supabase directly, so the freeze is also proven at
  the database: with the switch on, a write sent straight to PostgREST with
  a real session token is refused, and so is a storage upload. Printed, next
  to the same two requests succeeding with the switch off (positive control).
- New sign-ups during the window are the owner's dashboard step (checklist
  D4); the card states what happens to a sign-up that slips through.
- Reading a free lesson anonymously during the freeze: allowed or not is
  stated, and shown.

**MIG-016 · task · Move tooling: copy the database, the accounts and the
files; rewrite stored addresses**
- deps: MIG-003, MIG-013
- `scripts/migrate/`, each step re-runnable and resumable:
  1. dump from the source;
  2. reset the target, then restore;
  3. re-create what a dump does not carry (MIG-013's list), from the
     migrations, idempotently;
  4. copy every object of every bucket with its path, content type and cache
     settings unchanged, with a delta mode for a second pass;
  5. rewrite stored addresses that contain the source project host (and the
     old domain where MIG-004 found any), idempotently;
  6. carry the migration history so the CLI sees the target as up to date.
- Demonstrated local to local first. Printed: a second run of every step
  changing nothing.
- No key is printed. The source is only ever read.

**MIG-017 · task · Parity report: one command that proves source and target
are the same**
- deps: MIG-016
- Compares, class by class, and prints a table with a count per class and
  PASS or FAIL:
  - tables, columns, types, defaults, constraints, indexes, sequences;
  - functions (signature, SECURITY DEFINER, `search_path`, body hash),
    triggers including those on `auth.users`;
  - RLS flags and policies in `public` and `storage`; grants, including
    column grants on `profiles`;
  - extensions, `cron.job`, publication tables, bucket settings;
  - row counts for every table in `public`, `auth.users`, `auth.identities`;
  - per bucket: object count, total bytes, and a checksum for a sample of at
    least 20 objects or all of them if fewer;
  - rows still containing the source host or the old domain: zero, outside
    the allow-list.
- A class with zero objects on both sides is a FAIL.
- Positive control, printed: one deliberate difference in a scratch target
  (a dropped policy, a changed grant, a deleted row, a missing object) makes
  the report FAIL and name it.

**MIG-018 · task · Rehearsal 1 on the local stack, timed**
- deps: MIG-016, MIG-017
- A full production copy is moved into the local stack with MIG-016; the
  parity report prints PASS; the app, built with the new-domain values from
  MIG-014, runs against it.
- Smoke suite, each step with its printed result: sign-in by email; an
  anonymous free lesson; a signed-in lesson attempt; an existing lesson
  image and an existing voice recording load; a Studio edit and publish; an
  invite claim; the account export; every cron route answering with the
  secret and refusing without it.
- Printed: elapsed time per move step. From this, the first estimate of the
  freeze window.
- The local copy of production data is destroyed at the end; the evidence
  says so.

**MIG-019 · task · The new home matches the inventory, and cannot act on its
own yet**
- deps: MIG-001, MIG-014, and the owner's checklist steps H4 to H21
- The new Supabase project's region and Postgres major version equal the
  source's (printed side by side). Every inventory line from MIG-001 is
  compared with the new home: printed where an API or CLI reads it,
  owner-attested with a date where none does.
- The new Vercel project's environment NAMES equal the inventory's
  production list minus quiz-only names. **Printed proof that
  `TELEGRAM_BOT_TOKEN` and `CRON_SECRET` are absent and that
  `VOICE_ANALYSIS_MODE` and `COURSE_IMPORT_MODE` are off** (fact 13).
- A deployment on NEW-DOMAIN serves the landing against the empty project.
- If MIG-013 moved the repo: `scripts/board/config.mjs` points at the new
  owner, repo and project; `board-status.mjs` prints the same cards as
  before the move.

**MIG-020 · task · Rehearsal 2: hosted dress rehearsal with a copy of
production**
- deps: MIG-018, MIG-019
- The whole move runs from the live source (read-only, no freeze) into the
  new project. Parity report PASS, counts as of the dump.
- On NEW-DOMAIN, with the owner and the partner (checklist R3 to R6):
  sign-in by email, Google and Telegram, each landing on the SAME user id as
  in the source (ids printed side by side). The Telegram case is the proof
  of fact 9; a new user id there stops the card.
- An existing lesson image and an existing recording load from the new
  storage; a Studio edit; an export; a calendar feed.
- Printed proof that the rehearsal sent nothing: zero Telegram send calls,
  cron routes refusing, no provider call for voice or import.
- The target is reset and the move re-run; the report prints PASS again.
  Elapsed times printed for both runs.

**MIG-021 · task · Moving-day runbook and rollback, written from the
rehearsals**
- deps: MIG-015, MIG-020
- `docs/release/cutover-runbook.md`: numbered steps, each with who does it
  (owner or session, using the checklist's D codes), the expected printed
  output and a time budget taken from MIG-020's timings.
- Go and no-go criteria; the point of no return (the domain switch, D10);
  rollback before it (maintenance off on the old site, nothing lost);
  after it, fix forward, with the paused source kept 30 days.
- The smoke suite for the new domain; the redirect check list; the
  announcement texts in English and Russian.
- The owner approves it (checklist R9).

**MIG-022 · task · Legal revision for the new name, domain and operator**
- deps: MIG-013 with the name, domain and operator decided; MIG-014
- Terms, Privacy and Subprocessors carry the new name, domain, contact
  address and operator; the successor clause is used if the operator
  changes. Version bump, `current_terms_version()` re-emitted.
- The diff is shown to the owner before commit. The notice period before
  moving day is stated (at least 14 days) and whether an in-app notice is
  needed under 0095 is written in the evidence.
- Notes: the email is the owner's step (checklist R10).

**MIG-023 · task · Moving day**
- deps: MIG-021, MIG-022 and its notice period, the owner's go (checklist D1)
- The runbook is executed with the owner. Evidence, all printed: the freeze
  proof; the parity report PASS; the smoke suite on NEW-DOMAIN;
  `getWebhookInfo` showing the new address; ten old URLs each answering with
  a permanent redirect to the same path on NEW-DOMAIN; the first cron run
  on the new project; the first real sign-in after the switch.
- Any FAIL before the point of no return ends the attempt with the rollback
  step and a report. Nothing is patched on the spot.

**MIG-024 · task · The old home is switched off**
- deps: MIG-023
- By day 7: old redirect addresses removed from Google and BotFather; every
  secret that lived in the old Vercel project replaced (owner, checklist F5
  and F6), and the webhook re-set after the bot token changes.
- By day 30: the old Supabase project deleted and the old Vercel project
  removed (owner, F8 and F9); move-day dump files destroyed.
- The repo describes one product on one domain: `CLAUDE.md`, `handoff.md`,
  `README.md`, `docs/setup.md`, the verify skill, `.env.example`. The
  "Latest applied" line is re-derived against the new project.
- Printed: `rg -i "colloquiz"` over tracked files, with every remaining hit
  explained (history, the UID constant, the redirect).

**MIG-025 · task · Migration history squashed to a baseline (optional)**
- deps: MIG-024
- One baseline migration replaces the numbered history. `db reset` from the
  baseline produces a schema the parity report calls identical to hosted.
  The hosted history is repaired only on the owner's word.
- Notes: tidying only. Drop the card if the owner prefers the full history.

---

## `docs/handoff.md` deltas

Only the one paragraph in Phase 3 item 6. MIG-004, MIG-005 and MIG-013 each
end with their own delta text for the owner to commit.
