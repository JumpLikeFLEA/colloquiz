# 0226 — M6: separating the English product from Colloquiz

Status: **planned, not started** (owner, chat session of 2026-11-12). The owner
starts M6 only if the English product goes well; there is no date. The cards are
MIG-001..MIG-025 in `scripts/board/backlog.mjs`. MIG-001..003 are worth doing now.
Every other card waits behind MIG-004, a decision card that re-audits the repo and
hosted as they stand on the day the owner says go. Nothing below is a description of
the code on that later day.

Scoped from `prompts/m6-separation-backlog.md` (commit `dc77609`), with the Phase 1
audit and the Phase 2 challenge run in the Claude Code session of 2026-11-12. The
owner's manual steps live in a separate checklist, "Leaving Colloquiz: owner's
migration checklist"; its step codes (Z, C, H, R, D, F) are quoted in the cards.

## The bar

Colloquiz is closed and the English product runs on its own domain, repo, Supabase
project and Vercel project, with every account, lesson, recording and entitlement
intact.

## Settled inputs (owner, 2026-11-12)

1. **The quiz product is removed completely.** Quick Play, Deep Dive, My Quizzes,
   Groups, Duels, Leaderboard, Achievements, XP, the question bank, the generator and
   the Colloquiz admin tools are not carried along, hidden or otherwise. They are
   archived once and deleted. This supersedes docs/decisions/0109 Decision 3's "the
   Colloquiz admin tools stay at `/app/admin`" once Stage 1 runs; the course routes
   0109 kept (`app/api/admin/courses/**`, the `/app/admin/courses` → `/studio` 308)
   are English and survive.
2. **Two stages, in this order.**
   - Stage 1, on the current stack: quiz code is removed and shipped, then quiz tables
     are dropped. The site stays on colloquiz.app, English-only.
   - Stage 2: the English-only app is moved like-for-like. "Did everything arrive" is
     then a straight comparison of schema and row counts between the old and the new
     project, with nothing transformed on the way except stored addresses.
3. **A new dedicated organisation owns the new home:** a GitHub organisation, a Vercel
   team and a Supabase organisation. Not the owner's personal accounts.
4. **Full git history comes along.**
5. **Accounts with no English activity are notified, then erased** at closure. Only
   people who used the English side move.
6. **Name and domain are placeholders:** `NEW-NAME` (working name "Alina Cher";
   "Alliengll" is the earlier working name and is the bot's username), `NEW-DOMAIN`,
   `NEW-ORG`. No card hardcodes a guess.
7. **The operator is not decided** (the owner personally, as today in Terms §1, or a
   company). It is decided before MIG-022 and nowhere else.
8. **The planning chat project's sessions never write to the repo.** Every
   implementation arrives as a prompt for Claude Code.

## Facts, with pointers (re-checked 2026-11-12, Phase 1)

9. **The Telegram bot cannot be replaced.** The identifier Telegram returns at sign-in
   is issued per client, not the Telegram account number: docs/decisions/0098, the
   claims rows ("a pseudonymous per-client id", above the int64 maximum);
   `docs/release/legal/subprocessors.md:22` ("An identifier Telegram issues for this
   Service (not the Telegram account number)"). Reminder chat ids are `from.id` of a
   `/start` to the bot (0173 Decision 1). The same bot, `@Alliengll_bot`, moves; only
   its display name, description, picture, Web Login allowed URLs and webhook change.
   **Dependency:** the new project's provider is named exactly `custom:telegram` and
   carries the same client id as today (0098 "Configuration", items 1–2). MIG-019
   proves the client id with 0098's authorize-URL probe; MIG-020's same-user-id
   sign-in is the proof of the whole fact.
10. **Dashboard-only state exists.** `supabase/templates/` holds `confirmation.html`
    only; `supabase/config.toml` wires only `[auth.email.template.confirmation]`
    (l.255–257) and its SMTP block is commented out (l.236). The recovery template,
    the provider config, the URL allow-list and the SMTP settings are in the hosted
    dashboard.
11. **Four buckets:** `avatars` (`lib/avatar.ts:8`), `lesson-images`
    (`lib/lessonImages.ts:9`), `voice-recordings` (`lib/voice/recording.ts:15`),
    `course-imports` (`lib/courseImport/formats.ts:12`); the migrations create the same
    four. Storage objects are in no database backup on any plan (0142).
12. **Stored addresses contain the hosted project host. Measured 2026-11-12**, a
    read-only `db query --linked` on hosted: the project host
    (`kumrlovftctxcbbbmnfy.supabase.co`) in **37 of 74** `lesson_versions.document`
    rows, **2 of 8** `courses.cover_image_url`, **1 of 21** `profiles.avatar_url`;
    `colloquiz.app` in **0** rows of the three. Other columns were not probed; MIG-004
    probes every text and jsonb column. Source of the addresses: `getPublicUrl` in
    `app/(studio)/studio/courses/[id]/CourseDetailView.tsx:72`,
    `.../lessons/[lessonId]/LessonContentEditor.tsx:121,144` and
    `app/(colloquiz)/(main)/app/settings/AccountSection.tsx:142`.
13. **Four Vercel crons** (`vercel.json`, region `dub1`): `voice-purge`,
    `voice-analysis-sweep`, `telegram-reminders`, `course-import-sweep`.
    `.env.example:22`: "Without it those routes refuse everything" (`CRON_SECRET`); all
    four route files read it. A second deployment holding a copy of production data,
    the bot token and the cron secret would send every reminder twice.
14. **Shared pages sit inside the Colloquiz route group:** `app/(colloquiz)/(auth)`
    (login, signup, reset-password, `AuthScreen`, `PaperAuthFrame`) and
    `app/(colloquiz)/(legal)` (terms, privacy, subprocessors). Name, city and picture
    are edited on `/app/settings` (`AccountSection.tsx`); 0181 Decision 2 keeps them off
    the English surface.
15. **The app sends no mail of its own.** `subprocessors.md:20`: Resend is "custom SMTP
    inside Supabase Auth; the app holds no API key and sends no mail of its own". A
    notice by email is a manual step for the owner.
16. **Terms §10 promises at least 14 days' notice** of a material change, in the app or
    by email (`terms-of-service.md:181`), and §12 allows transfer to a successor
    operator with notice (l.199–200). Terms are at 1.3.
17. **Old-domain and old-name strings in code:** `lib/site.ts:9` (SITE_URL default),
    `lib/site.ts:11` (SITE_NAME), `lib/calendar/ics.ts:77` (event UID suffix
    `@colloquiz.app`), `lib/calendar/ics.ts:123` (`PRODID:-//Colloquiz//…`),
    `app/api/account/delete/route.ts:101` (`privacy@colloquiz.app`), the three legal
    files (privacy 7, terms 5, subprocessors 1 hits for `colloquiz.app`).
    `git grep -n "Colloquiz" -- app lib ':!*.test.*' | wc -l` printed **79**. The English
    product's own name is a second set of literals: `lib/alliengll/copy.ts:34`,
    `app/(english)/landingCopy.ts:74,115`, `app/api/calendar/[file]/route.ts:41`.
    PRODID names the program that wrote the file; event identity is the UID (RFC 5545;
    no calendar client found that keys events on PRODID, none tested). So PRODID follows
    the English product's name (MIG-002) and only the UID suffix is frozen.
18. **The Supabase plan today is Free (owner, 2026-11-12).** No managed backups (0142).
    Destructive work in Stage 1 therefore needs a backup the owner has restored at
    least once (MIG-003).

## Assumed decisions (MIG-013 confirms or changes each)

- **A. Freeze, not zero-downtime.** Moving day uses a short announced maintenance
  window. Dual-writing is not built.
- **B. colloquiz.app redirects path-for-path to NEW-DOMAIN for at least 12 months.**
- **C. Calendar event UIDs keep their `@colloquiz.app` suffix** as an opaque constant,
  so calendar clients do not duplicate events. MIG-002 allow-lists it now; undoing an
  allow-list entry is cheap if C changes.
- **D. Stage 2 starts no earlier than 14 days after Stage 1's exit** (MIG-012).
- **E. The repo is transferred into NEW-ORG and renamed** rather than recreated blank,
  so issue numbers cited by commit messages and decision files keep resolving. A
  recommendation only; MIG-013 decides it, and the owner asked for "a new repo".
- **F. The old Supabase project is paused on moving day and deleted 30 days later.**
  Backups taken before an erasure are destroyed 30 days after it.
- **G. During the freeze the whole site shows the maintenance page, anonymous lessons
  included.** MIG-015 then proves one thing about anonymous play: a lesson tab already
  open when the freeze starts has its writes refused and shows a readable message.
  The mechanism is MIG-013's; `default_transaction_read_only` on the API roles is a
  candidate, unverified.

## Rulings from the Phase 2 review (owner, 2026-11-12)

- **Erasure (MIG-005).** Minting sessions with the JWT secret is ruled out. MIG-005
  lays out two options for the owner: one erasure body that takes a user id, with
  `delete_my_account` calling it for `auth.uid()` and an owner-only entry point for
  the closure; or the reverse order, dropping the quiz schema first (MIG-011) and then
  hard-deleting accounts with no row left in any remaining table. `delete_my_account`
  acts on the signed-in user (`v_me UUID := auth.uid()`, 037:45; MIG-004 re-checks
  the latest body, 109), which is why a third path is
  needed at all. Until MIG-005 decides, `dependsOn` stays as drafted. The profile count
  on 2026-11-12 was 21; the account-deletion protocol is not reduced for scale.
- **JWT secret (MIG-013).** The old project's secret is not carried to the new one.
  Session cookies belong to a domain, so everyone signs in again on NEW-DOMAIN whatever
  the secret is. MIG-013 records this with Supabase's "Migrating auth users between
  projects" page as the source, re-read that day; it is not an open option.
- **Rehearsal environments.** Rehearsals and MIG-016's local-to-local demonstration
  never run with `.env.local`. They use their own env file without
  `TELEGRAM_BOT_TOKEN`, `ANTHROPIC_API_KEY` or `ASSEMBLYAI_API_KEY`, pointing only at
  the local stack, and its printed names are the first evidence line.
- **Reset target.** The move tooling's target has no default: it is passed on every
  run, and the reset refuses when it is absent or equals the source ref.
- **MIG-006 is narrowed** to the sign-in and legal pages. Whether name, city and picture
  die or move is MIG-004's ruling (it would reopen 0181 Decision 2); if they move,
  MIG-004 proposes the card.

## Conventions for every M6 card

- "Printed" means command output pasted in the evidence comment. A count is copied
  from output, never typed.
- A comparison over zero objects is a FAIL, unless the check declares the class
  expected-empty with a reason and a control.
- Hosted writes follow "The hosted-apply gate". A destructive file needs the owner's
  word, per file (gate item 4).
- Every card that touches an English route pastes `npm run budget` before and after; no
  English route may grow.
- Secrets are never printed, committed or pasted.
- An owner's gate (a word, a go, a checklist step, a waiting period) cannot be a
  `dependsOn` entry, so it is the card's first acceptance line and the session stops
  there.

## The board

25 cards, ranks 4000 (MIG-001) to 4240 (MIG-025) in steps of 10, every dependency on a
lower-numbered card (no cycle). Decision cards: MIG-004, MIG-005, MIG-013. M5 stays the
active milestone; `next-card.mjs` is unchanged and M6 cards are worked with an explicit
`work on MIG-00x`. Once M5 completes, `work on next` picks MIG-001..003 while any is in
Ready, then reports "no pickable cards — every Ready card in the active milestone (M6)
is blocked by an open dependency" (a dependency counts only when its issue is CLOSED,
`isDepClosed`, and MIG-004 sits in Hold). If MIG-004 has not been moved to Hold by then,
it is reported as a `type:decision` pick instead; either way the session returns to
chat.

## What would make us revisit this

- The owner decides not to close Colloquiz, or to keep part of it: M6 is withdrawn or
  re-scoped, and every card after MIG-003 is re-specced.
- MIG-004 finds any fact above no longer true, or an English feature living in the quiz
  schema that this plan treats as quiz.
- Telegram starts returning the account id at sign-in, or Supabase changes how custom
  providers key identities: fact 9 and its dependency are re-derived.
- The plan changes from Free (fact 18): MIG-003's urgency and the backup rule change.
- MIG-013 changes any assumed decision A–G: the cards that rest on it are amended in the
  same commit as MIG-013's decision file.
