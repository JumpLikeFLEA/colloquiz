# 0072 — OPS-015: read-only report for insert-only rate-limit log tables

## Context

ANON-006's privilege review (docs/decisions/0066) found `pending_claims_creation_log`
(049) has no cleanup path at all. Checking the other insert-only rate-limit logs
found the same gap in `account_export_log` (038, no pruning at all) and, at the
time OPS-015 was filed, in `pending_claims_creation_log` itself — since fixed
inline by ANON-008 (migration 052, written, **not yet applied**), which mirrors
051:217's existing inline sweep in `record_funnel_event`.

`feedback` (026) was named alongside these three in OPS-015's own issue body and
in 052's migration comment, but it is not a bookkeeping log — it is real content
an admin triages (026's header: "Admins read and update everything; that is the
whole consumer," no owner-read policy). Grouping it with the rate-limit logs was
a wording slip, corrected during planning (owner, 2026-09-27): `feedback` has its
own retention promise, privacy-policy.md §7 — **up to 24 months**, not a 1-hour
rate-limit window — and must never be deleted on the rate-limit logs' schedule.

`account_export_log`'s schema is `(id, user_id, created_at)` (038:27-34) — a
user id and a timestamp, no IP address. The OPS-015 issue body's looser
description ("insert-only rate-limit log tables") is accurate; an earlier draft
of this decision mis-stated it as "timestamp + IP" (conflating it with
`pending_claims_creation_log`'s actual `(id, ip_address, created_at)` shape,
049) — corrected here.

## What the report found (real run against the hosted project, 2026-09-27)

```
pending_claims_creation_log (rate-limit window: 1 hour, pruning: lazy-on-next-insert)
  total rows: 0
  rows past their 1 hour window: 0
  oldest row: none (table is empty)

account_export_log (rate-limit window: 1 hour, pruning: none)
  total rows: 0
  rows past their 1 hour window: 0
  oldest row: none (table is empty)

funnel_events_creation_log (rate-limit window: 1 hour, pruning: lazy-on-next-insert)
  total rows: 28
  rows past their 1 hour window: 17
  oldest row: 2026-09-27T14:03:14.152804+00:00 (1.5 hour(s) old)
  newest row: 2026-09-27T15:01:17.439076+00:00

feedback (retention: 24 months per privacy-policy.md §7 — NOT a rate-limit log)
  total rows: 1
  rows past 24 months: 0
  oldest row: 2026-07-29T12:15:13.131389+00:00 (60.1 day(s) old)
```

`pending_claims_creation_log` and `account_export_log` are currently empty, so
this run is an empty-result check for those two specifically and proves nothing
about their behaviour under load (CLAUDE.md: "a check that passes on an empty
result is a failure until proven otherwise").

`funnel_events_creation_log` is the one table with real data, and it demonstrates
the exact gap this card exists to find: 17 of its 28 rows are already past the
1-hour window privacy-policy.md §3.4/§7 promises IPs are "deleted automatically
after one hour," with the oldest sitting at 1.5 hours. `record_funnel_event`
(051:217) only prunes on its own next call — during this quiet period nothing
called it, so nothing pruned it. The same lazy-on-next-insert shape applies to
`pending_claims_creation_log` (052:50) and will show the identical pattern once
it has traffic and a quiet period.

## Decision

1. Ship the report script only (`scripts/sweep-rate-limit-logs.ts`), covering all
   four tables. No deletion or scheduling in this pass — same precedent as
   AUTH-006's `sweep-lesson-images.ts`, and consistent with CLAUDE.md's bar on
   anything irreversible against the hosted database.
2. `feedback` is reported on its own 24-month retention threshold, never the
   1-hour rate-limit window. Enforcing that 24-month limit is out of scope here
   and is proposed as its own card below, not built in this pass.
3. The lazy-on-next-insert prune in `funnel_events_creation_log` and
   `pending_claims_creation_log` is real cleanup, but it only fires when
   traffic arrives — it is not a substitute for a schedule, and the real run
   above is the evidence, not a guess. A scheduled-deletion follow-up is
   proposed below.

## What would make us revisit it

- If `feedback`'s 24-month figure in privacy-policy.md §7 ever changes, this
  report's `FEEDBACK_RETENTION_MS` constant needs to move with it.
- If `account_export_log` or `pending_claims_creation_log` accumulate real
  traffic, re-run the report — the current empty-table result proves nothing
  about their past-window behaviour.

## Proposed follow-up cards

- **Scheduled deletion for the three rate-limit logs.** Acceptance: no row in
  `pending_claims_creation_log`, `account_export_log`, or
  `funnel_events_creation_log` older than 1 hour + one schedule interval,
  verified by re-running `scripts/sweep-rate-limit-logs.ts`. Evidence for why
  this is needed rather than speculative: this report found
  `funnel_events_creation_log` sitting at 17/28 rows past its promised 1-hour
  window during an ordinary quiet period.
- **Enforce `feedback`'s 24-month retention.** Acceptance: rows older than 24
  months are deleted (or the admin queue for old open items is otherwise
  resolved) on a schedule, verified by re-running the same report's `feedback`
  section. Not urgent today — the real run above found 0 rows past the
  threshold — but the promise in privacy-policy.md §7 is currently unenforced
  by any code.
