# 0196 — SHELL-035: the band tone is removed

## Context
SHELL-033 (0192 Decision 6) left `BandTopBar`, `AccountMenu` and `LanguageToggle` with a `tone` prop
defaulting to `"band"` (white-on-gradient). Every caller passed `tone="paper"`, so the default selected
dead code.

## Options
1. Keep the prop, flip the default to `paper`. Leaves the dead branch.
2. Remove the prop and the band branch. Chosen.

## Decision
`tone` is gone from all three components and from all 13 caller files; the paper look is the only one.
Band-only classes (`text-white` on the wordmark/back link, `ring-white`, `bg-white/10`, `text-brand-deep`
chip) are deleted. Remaining `text-white` in those files is on `bg-brand` fills (paper look). Test
file needed no change (it never referenced `tone`).

## Evidence
`rg tone app/(english)` finds only prose in comments. `npm run check` exit 0, `npm test` 1854 passed.
`npm run budget`, before -> after (KB): `/` 192.7 -> 192.6, course page 176.4 -> 176.3,
`/invite` 177.0 -> 177.0, free lesson 257.7 -> 257.7. `/my` and the signed-in routes FAIL on sign-in both
before and after (the fixture users cannot sign in on this machine's local stack), so they are not measured.

## Revisit
If a gradient band returns on the English surface, add it as its own component, not as a tone here.
