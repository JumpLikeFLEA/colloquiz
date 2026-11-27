# 0250 — The account export reads every set in pages (OPS-044)

Date: 2026-11-27. Card: OPS-044 (#338). Found by PROG-012 (docs/decisions/0236).

## Context

`app/api/account/export/route.ts` read each table and each set-returning RPC with one request.
PostgREST ends a response at `max_rows` and returns no error, so the rows past it were missing
from the file with nothing to say so.

**The limit, read 2026-11-27:**

- hosted: `max_rows = 1000` (Management API `GET /v1/projects/<ref>/postgrest`, read-only);
- local: `max_rows = 1000` (`supabase/config.toml`, line 18).

**Reproduced on the local stack, before the change** (`scripts/account-export-local-run.ts`, its
"before (unpaged)" line, which makes the old one-request reads):

    before (unpaged): lesson_attempts count(*) 1005, exported 1000; messages count(*) 1005, exported 1000

A scratch-script run of the route's literal old `lesson_attempts` query gave the same:
`count(*) = 1005; route query returned 1000 rows (error: null)`, and 999 of 999 under the limit.

**Every read in the export, and whether the limit can cut it:**

| Read | Kind | Can be cut |
|---|---|---|
| `profiles` | `.single()` by `id` | no |
| `results` | table | yes |
| `user_achievements` | table | yes (bounded by the catalogue in practice) |
| `group_members` | table | yes |
| `get_my_duels()` | `RETURNS TABLE` | yes |
| `lesson_attempts` | table | yes, reproduced |
| `signup_acquisitions` | `.maybeSingle()`, PK `user_id` | no |
| `lesson_opens` | table | yes |
| `course_entitlements` | table | yes |
| `run_enrolments` | table | yes |
| `my_claimed_run_invites()` | `RETURNS TABLE` | yes |
| `voice_submissions` | table | yes |
| `run_final_comments` | table | yes |
| `my_teacher_links()` | `RETURNS TABLE` | yes |
| `my_group_memberships()` | `RETURNS TABLE` | yes |
| `my_conversations_export()` | `RETURNS TABLE`, one row per message | yes, reproduced |
| `my_homework_export()` | `RETURNS TABLE` | yes |
| `my_author_seat_export()` | `RETURNS TABLE`, PK `user_id` | no (one row) |
| `calendar_feed_status()` | `RETURNS TABLE`, one row | no |
| `my_telegram_link()` | `RETURNS TABLE`, PK `user_id` | no (one row) |
| `my_voice_analyses_export()` | `RETURNS TABLE` | yes |
| `writing_submissions` | table | yes |
| `my_notebook()` | `RETURNS JSONB`, one value | no (0236) |

Embedded relations (`groups(...)`, `voice_feedback(...)`, `writing_feedback(...)`, `courses(...)`)
are to-one or one-row-per-parent; they are not the top-level response `max_rows` limits.

## Decisions

1. **Page every set the limit can cut, with one helper.** `lib/pagedRead.ts`'s `readAllPages`
   asks for consecutive `.range(from, to)` pages of 1,000 until a page comes back short; any page
   error fails the read with no rows. The reads moved to `lib/accountExportReads.ts` so the route
   and the local run execute the same code. The route still fails the whole export on any failed
   section, a page included (0225 Decision 14): no partial file.

2. **The page size equals `max_rows` (1,000), and the stop rule is "a short page".** Options:
   (a) stop on a short page: one request for a small section, as before; (b) stop on an empty
   page: robust to a server limit below the page size, but one extra request for every section
   of every export; (c) ask for `count=exact` and compare. (a) was chosen: both limits are 1,000
   today and printed above. Its failure mode is known: if hosted `max_rows` is lowered below
   `PAGE_SIZE`, every page comes back short and the read is cut again after one page.

3. **Every paged read has a total order.** Each keeps its old sort column and adds a column
   unique per row for this user (`id`, `achievement_id`, `group_id`, `lesson_id`, `course_id`,
   `enrolment_id`, `duel_id`, `invite_id`, `link_id`, `message_id`, `assignment_id`,
   `submission_id`). `my_group_memberships()` returns no unique column; it is ordered by all three
   of its columns, so rows that tie are identical in every field and the paged list is the same
   list. Adding a column to that function was not needed for this, and would be a migration.
   The order for an RPC is applied by PostgREST to the outer query; the function's own
   `ORDER BY` is not relied on across `LIMIT/OFFSET`.

4. **No change to RLS, the `user_id` filters, the payload shape or `lib/accountExport.ts`.**

## Measured

`npx tsx scripts/account-export-local-run.ts`, local stack (`http://127.0.0.1:54321`):

    PASS  lesson_attempts past the limit: count(*) 1005, exported 1005, distinct ids 1005, id set equal to table true
    PASS  messages past the limit (RPC): count(*) 1005, exported 1005, distinct ids 1005, id set equal to table true
    cleanup: 0 rows left for the scratch account
    PASS  control covers sections: 16 sections with rows in some control; empty in all: resultsRes, achievementsRes, membershipsRes, duelsRes, invitesRes, calendarFeedRes, acquisitionRes
    PASS  a failed second page fails the export: refused: column lesson_attempts.no_such_column does not exist
    OPS-044 local run: PASS

- The 1,005 attempts share 7 timestamps (about 144 rows each, so page 1 ends inside a tie), and
  the 1,005 messages share one: the order rests on the tiebreak alone, and no row is lost or
  repeated.
- Control: six fixture accounts (`prog002-learner`, `prog007-learner`, `play006-entitled`,
  `hw-student`, `hw-student2`, `hw-teacher`), every section equal to the old one-request read as
  sorted JSON.
- Not reached with rows: `results`, `user_achievements`, `group_members`, `get_my_duels()`,
  `my_claimed_run_invites()` (no local account has any). Their paged queries ran without error, and
  PostgREST rejects an unknown order column even on zero rows (the failing-page case above is that
  error), so the order columns exist; the paging itself is only shown on the two reproduced reads.
- `lib/pagedRead.test.ts`: 0 rows, one page, exactly the limit, limit + 1, a failing second page.
- Not measured: hosted (the change is client-side reads under the user's own session; nothing was
  written there), a real export download through the route, the route's time for a large account.

## Revisit if

- Hosted `max_rows` changes (Decision 2): `PAGE_SIZE` must follow it, or the stop rule becomes (b).
- A new export section returns a set: it goes through `readAllPages` with a total order.
- An export gets slow enough that pages in sequence matter: a job, not a bigger page.
