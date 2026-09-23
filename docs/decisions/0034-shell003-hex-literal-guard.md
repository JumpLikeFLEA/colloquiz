# 0034 — Hex-literal guard implementation (SHELL-003)

## Context

SHELL-003's acceptance requires `npm run check` to fail on a new hex-colour
literal under `app/` or `lib/` "outside an explicit allow-list," naming only
`lib/site.ts` and `app/global-error.tsx` as that list. A fresh `rg` (Phase 1
M1 audit, then re-confirmed here 2026-09-23) found 78 hex-literal occurrences
across 34 distinct values already in the tree outside vendored/token files —
`docs/handoff.md` "Visual work" §1 says explicitly not to migrate this backlog
in one commit. A rule naming only two exempt files, applied literally, would
fail immediately on the other 11 files that already carry legitimate hex
(Recharts/tier/OAuth-brand colour maps, Satori icon generators that also have
no CSS custom-property access).

## Options

1. **File-level allow-list, exactly the two named files exempt, everything
   else zero-tolerance.** Matches the issue text most literally, but breaks
   the build today on 11 files with pre-existing, undisputed hex (e.g.
   `lib/glicko2.ts` tier colours, `app/icon.tsx`'s Satori-rendered stroke).
   Would force migrating those 11 files as a side effect of a guard card,
   contradicting the explicit "do not migrate" instruction.
2. **No guard at all beyond doc hygiene.** Meets none of acceptance line 3.
3. **Per-file count ratchet.** Two exempt files (unlimited, per the issue —
   both are non-CSS contexts: Satori `next/og` rendering and the inline-styled
   root error boundary), plus a frozen per-file baseline for every other file
   that currently has hex literals. A file's count may not exceed its
   baseline; a file with zero today may not introduce any. Growth in an
   existing file or a wholly new file both fail; swapping one existing
   literal's value for another (no count change) does not.

## Decision

Option 3 (`scripts/check-hex-literals.mjs` + `scripts/hex-literal-baseline.json`,
wired into `npm run check`). It satisfies "stop the debt growing" literally —
the thing the issue and `docs/handoff.md` both ask for — without requiring a
migration the same card explicitly forbids. No new npm dependency: the script
is a plain Node walk + regex, no ESLint plugin package. Verified by planting a
literal in an already-ratcheted file (`lib/categoricalColor.ts`, baseline 3 →
found 4 → exit 1) and in a brand-new file (`lib/plantedTest.ts`, baseline 0 →
found 1 → exit 1); both pass again once reverted/removed.

The "644 hardcoded Tailwind palette classes with no `dark:` variants" figure
in the old `CLAUDE.md` text could not be reproduced — a same-scope `rg` for
literal palette-colour utility classes (`bg-red-500` and siblings, all
non-token Tailwind palette prefixes) finds 3 occurrences today, and nothing in
the codebase currently distinguishes "has a `dark:` counterpart" from
"doesn't." Rather than replace one unfounded figure with another, it is
dropped from `CLAUDE.md`; SHELL-004 (already scoped as the `.dark`-gap spike)
is the right place to build that check if the figure is wanted again.

## What would make us revisit it

- If the Tailwind-palette-class figure is wanted with a real "no `dark:`
  pairing" check, that is new tooling, not a re-derivation — scope it as its
  own card (candidate: fold into SHELL-004).
- If a file in the baseline should genuinely shrink (an existing hex literal
  is migrated to a token), regenerate the baseline with
  `node scripts/check-hex-literals.mjs --update-baseline` in the same commit
  as the migration, so the ratchet tightens rather than silently staying
  loose.
- If a new file legitimately needs the same non-CSS-context exemption as
  `lib/site.ts` / `app/global-error.tsx` (e.g. a future Satori generator),
  add it to `EXEMPT_PREFIXES` in the script with the same reasoning cited
  inline, not just to the baseline.
