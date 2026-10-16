# 0142 — Supabase plan: stay on Free until a threshold fires, then Pro

Resolves OPS-018 (#149) and INFRA-003 (#112). Owner decision, 2026-10-16.

## Context

0076 left the plan open and set three triggers (DB 300 MB, storage 600 MB,
egress 3 GB/month) that open INFRA-003. OPS-018 asks for the plan before real
learners and recordings depend on the project. No trigger has fired: the
last measurement (0076, 2026-09-28) was DB 41.24 MB, storage about 0.87 MB,
egress 0.018 GB. That measurement is 18 days old; it was not re-run here.

## Facts (Supabase's own pages, fetched 2026-10-16)

| | Free | Pro |
|---|---|---|
| Price | $0 | from $25/month |
| Database | 500 MB | 8 GB disk, then $0.125/GB |
| File storage | 1 GB | 100 GB, then $0.0213/GB |
| Egress | 5 GB | 250 GB, then $0.09/GB |
| Pausing | paused after 1 week of inactivity | never paused |
| Backups | none managed; docs tell Free users to export with `supabase db dump` | daily, last 7 days |
| Spend cap | n/a | on by default |

- Source: https://supabase.com/pricing (table above) and
  https://supabase.com/docs/guides/platform/backups (backups).
- PITR is an add-on for Pro and up: 7 days about $100/month, 14 days about
  $200, 28 days about $400. It needs at least Small compute and replaces the
  daily backups. Not wanted here.
- **Backups never include Storage objects**, on any plan (same backups page).
  So voice recordings are not backed up by upgrading. Pro changes pause and
  database backup, nothing about recordings.

## Projection (inputs are assumptions, labelled; none comes from the partner)

Measured: 32 kbps is about 240,121 bytes/min (0097). Hard cap per take is
`VOICE_MAX_SECONDS` = 600 s (0110). Assumed: 5 recordings per learner per
run (4 weekly tasks, the before/after pair reusing the first and last), all
learners record every task. Derived, not measured:

| per take | storage per learner | learners to reach the 600 MB trigger |
|---|---|---|
| 3 min (0.72 MB) | 3.6 MB | 166 |
| 10 min cap (2.4 MB) | 12 MB | 50 |

50 learners at 3-minute takes is about 180 MB. Takes are purged 6 months after
the course ends (0111), which bounds growth. Egress: one playback by the
partner per take plus learner replays is the same order as storage per run,
far below 3 GB/month at these sizes.

## Decision

1. Stay on the Free plan. Upgrade to Pro ($25/month) when any 0076 trigger
   fires; the owner buys it. This is INFRA-003's answer: option 1 (upgrade).
   Options 2 (egress-free object store) and 3 (self-host) are not pursued;
   revisit only if Pro limits themselves approach, which at these volumes is
   not foreseeable. Self-hosting rebuilds auth, RLS roles, PostgREST and
   Storage; that cost is not argued here because nothing points at it.
2. The 0076 triggers are the "danger zone". They are the only definition used.

## Risks accepted by staying on Free

- **Pause after a week of low activity.** A running cohort is active, so
  unlikely mid-run, but a quiet gap between runs or before OPS-020 can pause
  it. Mitigation: look at the dashboard before any rehearsal or run start.
- **No managed database backup.** Paid learners' progress, enrolments and
  feedback have no restore point. Mitigation (not built): run
  `supabase db dump` by hand before each run start and weekly during one.
  Recordings need a separate copy either way.

Both are time-based or event-based, not threshold-based, so the triggers will
not catch them.

## What would make us revisit it

- Any 0076 trigger crossing (re-run the 0076 queries plus the dashboard).
- A pause happening, or the first paid run starting with no backup routine.
- The partner's real learners-per-run and take length: replace the assumed
  inputs above.
- Supabase changing Free/Pro limits (figures dated 2026-10-16).
- The unexplained 41.24 MB vs 27 MB DB size gap (0076) still open.
