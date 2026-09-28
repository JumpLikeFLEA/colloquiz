# 0076 — INFRA-001: storage, egress and plan, with trigger thresholds

## Context

INFRA-001 sits outside the M0–M4 milestones (OPS-011, #87) and its job is
measurement, not action: "self-hosting Postgres on AWS is explicitly NOT the
starting point." This records what was measured on the hosted project
(`kumrlovftctxcbbbmnfy`, `colloquiz`, region `eu-west-1`) and the thresholds
that open INFRA-003.

## What was measured (2026-09-28)

**Plan:** Free (dashboard, Settings → Billing → Usage Summary; owner-supplied
screenshot — the Management API PAT in `.env.local` has no org/billing scope,
confirmed by `GET /v1/organizations` returning `[]` and
`/v1/projects/{ref}/billing/subscription` returning 404).

**Database size:**
- Dashboard (Settings → Database → Database & Storage Size): **41.24 MB**,
  also shown in the Usage Summary as 0.043 GB. This is the figure Supabase
  bills against.
- `SELECT pg_size_pretty(pg_database_size(current_database()))` run via the
  Management API's `POST /v1/projects/{ref}/database/query`: **27 MB**.
- These two real measurements disagree and the gap is not explained by
  anything measured here — flagged as an open question below rather than
  guessed at (CLAUDE.md: "never construct an explanation" for a surprising
  number).

**Storage, per bucket** (same Management API query endpoint, real run against
`storage.buckets` / `storage.objects`):

```
avatars         1 object    695 kB  (711296 bytes)
lesson-images   5 objects   171 kB  (174827 bytes)
```

Total ≈ 0.85 MB, consistent with the dashboard Usage Summary's "Storage Size:
0.001 GB".

**Egress (current billing cycle, dashboard Usage Summary):** 0.018 GB
(cached egress separately: 0.005 GB).

**Free-plan included limits** (supabase.com/docs, "Billing on Supabase" +
dashboard's own "Included in Free Plan" line on the Database Size detail
page):
- Database size: 0.5 GB per project (dashboard).
- Storage: 1 GB (docs).
- Egress: 5 GB/month (docs).

**Inactivity-pause behaviour (Free plan):** "We may pause applications on the
Free Plan that exhibit low activity in a 7-day period to save on server
resources." — supabase.com/docs/guides/platform/going-into-prod. Recorded per
INFRA-001's acceptance line as a launch risk: a quiet pre-launch project (no
traffic during scoping/authoring work) can be paused and needs an unpause
before a launch rehearsal, not just before go-live.

## Decision

Trigger thresholds, set at 60% of the Free-plan included limit per
INFRA-001's own suggestion, using the dashboard figures (the ones Supabase
bills against) as the reference number for database size:

| Metric | Free-plan limit | 60% trigger | Current | Headroom |
|---|---|---|---|---|
| Database size | 0.5 GB | 300 MB | 41.24 MB | 14× |
| Storage | 1 GB | 600 MB | ~0.85 MB | ~700× |
| Egress | 5 GB/month | 3 GB/month | 0.018 GB (this cycle) | ~165× |

Any of the three crossing its trigger opens INFRA-003 (`type:decision`:
upgrade plan / egress-free object store / self-host, in that order).

None is remotely close today. The nearest is database size at 14× headroom,
still far from the trigger — INFRA-002 (image resize/WebP at upload) works
against storage and egress growth specifically, and neither is near its
threshold yet either.

This card must run before OPS-010 per its own acceptance line; nothing else
in this pass depends on it.

## What would make us revisit it

- Any of the three trigger percentages being crossed on a future check —
  re-run the same two SQL queries (`pg_database_size`, the bucket-size query
  above) plus a dashboard check for egress/plan, and open INFRA-003 if
  crossed.
- The database-size discrepancy (41.24 MB dashboard vs. 27 MB
  `pg_database_size`) resolving itself with an explanation — until then,
  the dashboard figure is used as the conservative (larger) reference for
  the trigger table above.
- Free-plan limits or the 7-day pause window changing in Supabase's own
  pricing/docs — the numbers here are dated 2026-09-28 and are not
  re-verified automatically.
- The Management API PAT gaining org/billing scope, which would let this
  measurement be re-run without a dashboard round trip.
