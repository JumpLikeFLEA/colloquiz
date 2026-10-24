# 0207 — Costs: a usage ledger, a Studio dashboard and a sponsor report

Date: 2026-10-24. Owner request, this session. Cards: OPS-031, OPS-032, OPS-033.

## Context

If the first users respond well, the owner needs one admin-only place in
Studio for what the project spends and what it has left, instead of the
Supabase, Vercel, Claude Console and AssemblyAI dashboards, and a report of
expenses to hand to sponsors.

What the app records today:

- **Claude usage** is stored as tokens per call:
  - voice analysis in `voice_analyses.usage` (096, written by
    `lib/voice/analysis/pipeline.ts`);
  - course import in `course_imports.usage`, one entry per call (103,
    `lib/courseImport/pipeline.ts`);
  - neither stores a cost (`lib/voice/analysis/claude.ts`: "Tokens only;
    what they cost is a calculation, not a fact").
- **AssemblyAI usage** is stored as `audioSeconds` in the same voice row
  (097, `voice_analysis_advance`).
- **None of it lasts.**
  - A voice row is deleted with its take: replaced, purged after six
    months (098 `voice_mark_removed`), or with its account (ON DELETE
    CASCADE from `voice_submissions`, 096).
  - Import rows go with their account (103 section 8).
- **Some paid calls are never recorded.**
  - A refused or cut-off voice analysis stores no usage:
    `voice_analysis_fail` (096) has no usage argument, and
    `lib/voice/analysis/claude.ts` throws before reading `res.usage`.
  - An import call that throws in `converse()` (refusal, `max_tokens`)
    never reaches `usage.push` (`lib/courseImport/pipeline.ts`).
  - When the SDK's `parse` throws on unparsable output, it drops the
    response, and its usage with it (`lib/voice/analysis/claude.ts`
    comment, probed on SDK 0.104.1).
- **The app can measure** its own database size and its Storage objects (SQL
  over `pg_database_size` and `storage.objects`).
- **It cannot measure** egress, Vercel usage, plan limits or provider credit
  balances.
  - The PAT in `.env.local` has no org or billing scope (0076).
  - No Vercel token exists (no `VERCEL_*` variable is read beyond the commit
    SHA, `next.config.ts`).

## Decisions

1. **Spend comes from the app's own ledger plus bills typed in by an admin.**
   Owner's choice. Rejected:
   - Anthropic's Usage and Cost Admin API: it needs an `sk-ant-admin` key,
     which can also manage members and API keys, works only on an
     organization account, and would sit in Vercel's env.
   - A Vercel API token: a second powerful credential in the deployment.

   Revisit when a sponsor asks for the provider's own billed figure rather
   than the app's estimate.
2. **The ledger holds no personal data.** `provider_usage_events` carries
   no user id and no reference to a take or an import: a provider, a
   feature, a model, token counts, audio seconds and an outcome. So it
   survives purges and account deletion without being a record about a
   person, and the privacy policy and `delete_my_account` are unchanged.
   Rejected: a user id or a take id, which would make the ledger something
   to erase on deletion and so lose exactly the history it exists to keep.
3. **Recorded at the call site, through an injected dependency.**
   - Each pipeline gets `recordUsage(event)`, called right after each
     provider call, success or not, so it is tested with the pipelines'
     existing fakes.
   - A ledger write that fails is logged and never fails or retries the
     pipeline: losing one line of cost data is cheaper than failing a
     learner's analysis over it.
   - Rejected: writing the ledger inside `voice_analysis_finish` /
     `course_import_advance`. Those run only on success, so the failed
     calls this exists to catch would still be missed, and re-emitting both
     functions widens the hosted gate.
4. **A failed call records what is known.**
   - When the response came back (refusal, `max_tokens`, schema mismatch on
     a returned answer), its usage travels on the error and is recorded with
     `outcome = failed`.
   - When the SDK's `parse` threw on unparsable output, the model ran but
     its usage is gone: one event with null tokens is recorded, counted on
     the dashboard as "calls with unknown usage", never as $0.
   - Connection errors and HTTP errors are not recorded: no answer was
     produced.
5. **Backfill from what still exists.** Migration 104 copies the usage still
   held in `voice_analyses` and `course_imports` into the ledger once.
   History before that, from deleted takes and accounts, is gone, and the
   dashboard says the ledger starts on its first row's date.
6. **Prices live in code, dated.** `lib/costs/prices.ts` holds per-model
   rates with an `effectiveFrom` date, so a past month keeps the price it
   had. The figures are copied from the providers' pricing pages, with the
   URL and the date read in a comment. A model the table does not know is
   shown as unpriced usage, never as $0 (CLAUDE.md: a check that passes on
   an empty result is a failure). Rejected: prices in a table an admin
   edits. They change a few times a year, and a code change is reviewed.
7. **Credit left is an estimate, labelled as one.**
   - It is the latest `credit_topup` the admin entered for a provider,
     minus the ledger's estimated spend since that date.
   - Neither provider's balance is readable without the admin key that
     Decision 1 rejects.
8. **Sponsor report: a PDF generated on the server** (owner's choice over a
   print page). It means a new npm dependency, `@react-pdf/renderer`, used
   only by an admin route in Studio, never by an English route.
   - The report holds totals, the manual expenses with their references,
     the usage-based estimate with its method, and unpriced usage listed
     apart.
   - It holds no per-user row and no personal data.
   - USD only (owner). An expense paid in another currency is entered
     already converted, with the original amount in its note.
   - Receipts are a reference (an invoice number or URL), not an uploaded
     file (owner).

## What would make us revisit

- A sponsor or accountant needs billed figures, not estimates: add the Admin
  API cost report (Decision 1) or upload receipts.
- The estimate and a provider invoice differ by more than ~10% over a month:
  check the price table and the gaps of Decision 4 before anything else.
- Usage grows to the point where per-call rows matter for size (the ledger
  is small: one row per provider call).
