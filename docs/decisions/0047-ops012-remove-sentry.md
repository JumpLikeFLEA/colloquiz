# 0047 — OPS-012: removing Sentry, and what stayed untouched

## Context

OPS-012 (issue #118) executes the removal decision-0046 already approved by
the owner: Sentry has never been wired to a monitored destination anyone
acts on, so its cost (bundle bytes on every route, a CSP `connect-src`
allowance, the `lib/sentryScrub.ts` PII-scrubbing surface) was being paid for
no realized benefit. This card is a mechanical removal, not a decision on
whether to remove — the only decisions made while executing it are about
which of the many files that *mention* Sentry actually needed to change.

## Decision — scope of the sweep

Removed (code, config, deps):

- `instrumentation-client.ts`, `sentry.server.config.ts`,
  `sentry.edge.config.ts`, `instrumentation.ts` (the last had no purpose
  once its only two calls — `register()`'s dynamic imports of the two init
  files, and `onRequestError = Sentry.captureRequestError` — were gone).
- `lib/sentryScrub.ts`, `lib/sentryScrub.test.ts`.
- `next.config.ts`: the `withSentryConfig` wrap, the CSP `connect-src`
  Sentry origins, the `import { withSentryConfig }` line.
- The "reaches Sentry in production" comment in `app/(main)/error.tsx`
  (the `console.error` call itself is unchanged — it still surfaces in the
  browser console in dev; there is no other consumer now).
- `@sentry/nextjs` from `package.json` / `package-lock.json` (`npm
  uninstall`).
- `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_ORG` / `SENTRY_PROJECT` /
  `SENTRY_AUTH_TOKEN` from both `.env.example` and `.env.local.example`
  (`.env.local` itself is gitignored, untouched, and irrelevant to what ships).
- The Sentry row in `docs/release/legal/subprocessors.md`'s "Added as part
  of the 1.0 release" table, and the "error monitoring" clause in
  `docs/release/legal/privacy-policy.md`'s legal-basis table (no monitoring
  tool remains, so the purpose row overstated what's collected). Both
  documents' "Last updated" stamps bumped to today per subprocessors.md's own
  change procedure ("bump the version and date... of this file and of the
  Privacy Policy").
- The two Sentry checklist items in `docs/release/launch-checklist.md`
  (§3 "accounts to create", and the two go/no-go clauses in §5/§6) — these
  are forward-looking, not-yet-done manual steps for an unshipped 1.0; leaving
  them would tell whoever runs the checklist to configure a dependency that
  no longer exists.
- `CLAUDE.md`'s repo map, which listed `sentryScrub.ts` among the pure
  `lib/` modules.
- A new `docs/ui-decisions.md` entry marking the 2026-08-29 "Ops & resilience
  surface" entry's Sentry bullet as superseded, rather than rewriting that
  entry (append-only convention).

**Left alone, deliberately:**

- `docs/release/handoff/*.md` and `docs/release/definition-of-ready-1.0.md`.
  These are dated, past-tense session records of what was true when each was
  written ("Session E... Sentry, Vercel Analytics", "\[x\] Sentry (server +
  client + edge)..."). They document history, not current state — the same
  reason `docs/decisions/*` files aren't rewritten when a later decision
  supersedes one. Rewriting them to erase Sentry would misrepresent what
  actually happened in those sessions.
- `prompts/m2-backlog.md`. A fixed historical prompt (an audit brief someone
  wrote and ran), not a living spec; it asks where Sentry's client SDK
  initializes as one of several audit questions, which was a true and
  answerable question at the time it was written.
- `scripts/board/backlog.mjs`'s OPS-012 entry itself. It *is* the issue body
  — the text that describes removing Sentry necessarily says "Sentry"
  throughout its own acceptance criteria, same as this card's issue #118.

**Consequence for the acceptance line "`rg -i sentry` finds nothing outside
git history":** read literally against the whole working tree, the three
categories above still match. Interpreted as "no live code, config, or
forward-facing operational doc still references Sentry as if it exists,"
which is the only reading that doesn't also demand rewriting past session
records, decision docs, or the issue's own body text — the sweep above
satisfies it. The evidence comment for #118 states this explicitly and lists
which files still match and why, rather than claiming a bare-zero count that
would be wrong.

## What would make us revisit it

- If a future card wants error monitoring back, it should pick a monitored
  destination first (per the standing objection in decision 0046) and can
  restore `lib/sentryScrub.ts`'s scrubbing logic wholesale from git history —
  the PII rules (strip the cookie jar, `Cookie`/`Authorization`/`sb-*`
  headers, email, IP) don't need to be re-derived.
- If the "outside git history" reading above is judged too permissive, the
  handoff/DoR docs would need an explicit "Sentry since removed, see OPS-012"
  addendum rather than a rewrite — never silently edited to remove the
  historical mentions.
