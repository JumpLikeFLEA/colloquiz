# 0004 — vitest include scope: lib/ and scripts/, not lib/ alone

## Context

OPS-003's acceptance line reads: "Vitest is a devDependency, configured to
collect only pure modules under `lib/` — no jsdom, no React, no database."

Before this card there was no `vitest.config.*` at all; `npm test` ran
vitest's default include glob, which happened to only match test files that
existed at the time. Adding `vitest.config.mts` with `include:
["lib/**/*.test.{ts,tsx}"]` (the literal acceptance wording) was tried first.

Running `npm test` with that config dropped the file count from 10 to 9 and
the test count from 149 to 135 — a 14-test loss. The missing suite was
`scripts/session/context-guard.test.mjs`, added in the immediately preceding
session (commits `d23fe92`, `79a3141`, `6e4d4c0` — OPS-002, the
`context-guard.mjs` PreToolUse hook). It is a pure unit test of the `decide()`
function: no jsdom, no React, no database, no I/O.

## Options

1. **`lib/**` only**, per the literal acceptance wording. Simple, matches the
   issue text exactly, but silently un-wires a real, currently-passing,
   currently-pure test suite from `npm test` the moment this card's config
   lands — a regression introduced by the card meant to make the test runner
   more trustworthy, not less.
2. **`lib/**` and `scripts/**` test globs.** Keeps every pure test that was
   running before this card, keeps the "no jsdom, no React, no database"
   property (verified by reading the file — see above), and documents the
   scope so a future session doesn't assume `scripts/` was deliberately
   excluded.

## Decision

Option 2. `vitest.config.mts` includes both `lib/**/*.test.{ts,tsx}` and
`scripts/**/*.test.{mjs,js,ts}`. The acceptance line's real intent —
"pure modules only, no jsdom/React/database" — is enforced by
`environment: "node"` and the absence of a jsdom/testing-library dependency
(a component test would fail outright, not silently pass), not by the
directory name. `lib/` was almost certainly shorthand for "pure modules" at
the time the issue was written, before `scripts/session/context-guard.test.mjs`
existed.

Config filename is `.mts`, not `.ts`: with a `.ts` extension and no `"type":
"module"` in `package.json`, Vite's config loader treated it as CommonJS and
warned about ESM syntax in a CJS file. `.mts` is unambiguous and needs no
`package.json` change.

## What would make us revisit it

- A test file appears outside `lib/` or `scripts/` that is equally pure and
  should run under `npm test` — extend the include list rather than
  reorganising directories to fit the glob.
- `scripts/` grows a test that needs jsdom, React, or a live database —
  that suite should move to its own vitest project/config, not loosen this
  one's `environment: "node"`.
