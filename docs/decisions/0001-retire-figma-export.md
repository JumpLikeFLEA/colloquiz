# 0001 — Retire `/figma-export` as the visual source of truth

## Context

`figma-export/` was the original Vite + React + Tailwind export from Figma
that the Next.js app was ported from. `CLAUDE.md`'s design fidelity rules
required every port surface to match it exactly, and treated it as the
thing to diff against when a UI change looked wrong.

The port finished a long time ago. Every surface added since (NotificationBell,
Groups, Leaderboard, Duels, Settings, Legal, the ops/resilience surface — see
`docs/ui-decisions.md`) has no Figma source at all; it composes from classes
and components already in the app. The "diff against the export" workflow has
not applied to new work for most of the app's history, and the folder had
drifted from being a reference into being a stale artifact nobody opened.

An audit for this retirement found `figma-export/` was untracked and
`.gitignore`'d — it was never part of the repo's git history, so deleting it
would not be recoverable the way a tracked-file deletion is. It also turned
out to hold a second, distinct bundle, `Main Menu Interface Design (2)/`,
pulled from a different Figma file than the original export, that nothing in
the app imports or references. That bundle's disposition is out of scope for
this decision (see "Proposed new card" below).

## Options considered

1. **Leave it in place, stop enforcing it.** Keeps the artifact around for
   occasional reference but leaves the rule in `CLAUDE.md` misleading (it
   would keep saying "the export is the source of truth" while nobody checks
   against it). Rejected — a standing rule nobody follows is worse than no
   rule.
2. **Delete it, replace the constraint with "match the running app."** The
   app itself is now the largest, most current source of design precedent;
   new UI already follows this pattern in practice (see every entry in
   `docs/ui-decisions.md` since NotificationBell). Chosen.
3. **Move it into the repo as a tracked historical artifact instead of
   deleting.** Would preserve it in git history, but keeps a 150-file, 1.9 MB
   dead React app in the tree indefinitely for a lookup nobody has needed
   since the port. Rejected as unnecessary weight; the archive tag (below)
   gives the same recoverability without carrying it forward.

## Decision

- `figma-export/` deleted from disk (2026-09-20).
- Because it was untracked, the full tree was archived first at git tag
  `archive/figma-export` (an orphan-branch commit, tagged, branch discarded)
  so the content is recoverable via `git show archive/figma-export --stat` /
  `git checkout archive/figma-export -- .` despite never having been in
  `main`'s history.
- `CLAUDE.md`'s design fidelity rule now reads "the running app is the visual
  source of truth": new UI composes from existing components/classes, colours
  come from tokens in `app/globals.css`, and a deliberate visual change to an
  existing surface is recorded in `docs/ui-decisions.md` in the same commit —
  the same discipline the export enforced, now anchored to the app instead of
  an external file.
- `app/components/figma/**` (incl. `ImageWithFallback`) is explicitly NOT part
  of this retirement — it is vendored runtime code the app imports, kept
  unlinted for the same reason `ui/**` is; the folder name is a leftover from
  where it came from, not a sign it's part of the deleted reference.
- Config residuals removed: `.gitignore` (`/figma-export`), `tsconfig.json`
  exclude, `eslint.config.mjs` `globalIgnores` entry + its comment.
- Prose residuals rewritten: `README.md` (stack blurb, repo-tree entry, quoted
  fidelity rule). `docs/ui-decisions.md` entries, `PLAN.md`, and inline
  "No Figma source" comments on since-added components were left alone —
  they are an accurate historical record, not stale claims.

## What would make us revisit this

- If a future redesign wants a real external design-reference workflow again
  (a new Figma file treated as source of truth for a specific initiative),
  that is a new decision, not a reversal of this one — it would get its own
  folder and its own entry, not resurrect `figma-export/`.
- If the archived tree in `archive/figma-export` turns out to be needed for
  something beyond history (e.g. recovering a specific asset), pull it via
  `git show archive/figma-export --stat` and `git checkout archive/figma-export
  -- <path>` rather than reverting this decision.

## Proposed new card

**Triage unported Main Menu Interface Design bundle** — `figma-export/` held
a second bundle, `Main Menu Interface Design (2)/` (own README, `App.tsx`,
components, 5 PNGs, sourced from a different Figma file:
`Main-Menu-Interface-Design`), postdating the original export by months, with
nothing in the app importing or referencing it. It went into the
`archive/figma-export` tag along with everything else, unevaluated. Acceptance:
identify which redesign track it belongs to (or confirm it has none) and
either file it as work with an owner, or record it as abandoned in a decision
file.
