# 0089 — The budget guard rebuilds a stale `.next`

## Context

`scripts/budget.ts`'s header said it built "if `.next` is missing or stale",
but `buildIfNeeded()` only checked that `.next/BUILD_ID` existed. In SHELL-019
(#140, docs/decisions/0086) a run after a source change reused the previous
build and printed the baseline 178.0 KB on `/` for code that measured
241.3 KB rebuilt from scratch.

Reproduced on this card's starting code (`5be3bdd`): a fresh build
(`rm -rf .next && npm run budget`) printed `/ | 178.0 KB`. A temporary edit to
`app/(english)/LandingContent.tsx` then added a 12,000-character random
base64 literal, rendered as a `data-probe` attribute on the page root. Run
again without deleting `.next`, the guard printed `/ | 178.0 KB` a second
time.

## Options

1. **Refuse** to run on a stale build, naming it, and leave the rebuild to
   the caller.
2. **Rebuild** automatically. The header already promised this.

For the staleness rule:

- **mtime** of sources against `BUILD_ID`. Rejected: it needs a list of
  input directories, and a directory missing from that list fails silently,
  which is this card's bug again.
- **A content fingerprint of the whole repo.**

## Decision

The owner chose rebuild, the whole repo, and including the env files.

**The rule.** After each successful `next build` it runs itself, the guard
writes `.next/budget-source-fingerprint`. Its contents are a sha256 over:

- every file `git ls-files -co --exclude-standard` lists, that is tracked
  files plus untracked files that aren't ignored;
- `.env`, `.env.production`, `.env.local` and `.env.production.local`,
  whichever exist.

**When the build is reused.** Only when `BUILD_ID` exists and the stamp
equals the fingerprint now. Every other case rebuilds:

- no `.next` at all;
- a `.next` with no stamp, such as one from a manual `npm run build`, from
  `next dev`, or from the guard before this change;
- a stamp that doesn't match.

**Other details.**

- A tracked file deleted from disk is hashed as missing, so deleting a file
  also forces a rebuild.
- The fingerprint is taken before the build and stamped after it. A file
  edited while the build runs therefore mismatches next time, rather than
  being recorded as built.
- If `git ls-files` fails, the guard stops instead of reusing the build.
- The pure part (fingerprint and decision) is `scripts/budgetBuildStamp.ts`,
  unit-tested in `scripts/budgetBuildStamp.test.ts`. The file listing and
  reading stay in `budget.ts`.

**Why the env files.** `next build` replaces `process.env.NEXT_PUBLIC_*`
"in the Node.js environment with the value from the environment in which you
run `next build`" and inlines it into browser JS
(`node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`,
line 164). Point `.env.local` at a different Supabase project, and a reused
build keeps rendering against the old one. They are gitignored, so
`git ls-files` never lists them. Only their hash is stored, never their
values.

**The trade.** Any change, a docs-only edit included, costs one `next build`
on the next run. That is accepted: the rule only ever errs toward a slower
run, never a stale figure.

`--url` is untouched. That branch never calls `buildIfNeeded()`, so it builds
nothing and reads nothing in `.next`.

## Verification

Same probe, same sequence, with the fix in place:

| run | state | guard printed | `/` |
|---|---|---|---|
| 1 | `.next` from the old guard, no stamp | `Rebuilding: .next has no budget source stamp …` | 178.0 KB |
| 2 | unchanged | `Reusing .next: sources unchanged since the last budget build.` | 178.0 KB |
| 3 | probe applied | `Rebuilding: sources changed since the last budget build …` | 187.9 KB ⚠ OVER BUDGET |
| 4 | probe reverted | `Rebuilding: sources changed since the last budget build …` | 178.0 KB |

`npm run budget -- --url=http://localhost:4174`, run against a separately
started `next start`, printed `Using existing server at
http://localhost:4174.` and no `Rebuilding`/`Reusing` line.

## Known limit

A source fingerprint can't see the database. A route that `next build`
prerenders statically would bake in whatever the database held at build
time, and publishing a course wouldn't invalidate it. Whether any measured
route is prerendered statically was not checked here. `/` and the course page
read cookies, which makes them dynamic, but that is an assumption about these
routes, not a measurement.

## What would make us revisit it

- Rebuild time becomes the bottleneck in a session's loop. Narrowing the
  fingerprint to build inputs is the obvious move, and it has to come with a
  test that a file outside the list can't change client JS.
- A measured route turns out to be statically prerendered from database
  data. That would need a separate staleness signal.
