# 0035 — SHELL-004 spike: `.dark` token gaps and the "three known `.dark` bugs" claim

## Context

`docs/handoff.md` ("Visual work" §1) deprioritised token hygiene at the start
of M1 (2026-09-21) after the Phase 1 M1 audit found no citation for a "three
known `.dark` bugs" claim. SHELL-004 is the low-priority spike that either
substantiates that claim or strikes it, and separately checks `app/globals.css`
for any real gap between `:root` and `.dark`.

## Token diff

Every custom property defined in `:root` was diffed against every custom
property defined in `.dark`, by parsing `app/globals.css` and extracting
`--name:` declarations from each block (script run inline, not committed —
a one-off check, not a tool the repo needs again):

```
Root count: 64 Dark count: 62
In :root but not .dark: ["font-size", "radius"]
In .dark but not :root: []
```

`--font-size` and `--radius` are the only gap. Both are non-colour layout
tokens (a base font size and a border-radius) with no theme-dependent
meaning — nothing in `.dark` overrides sizing, only colour. This is not a
`.dark` bug; it's the expected shape for tokens that don't vary by theme.

## Origin of "three known `.dark` bugs"

Searched `git log --all` (full history, `-S`/`-G` on the phrase, and commit
messages) for every appearance of "three known" and ".dark bugs":

- The phrase first appears in commit `d15f774` ("Update handoff.md",
  2026-09-21 17:34:38 +0200), in a newly-added line (`+`, not a modification
  of prior text): "Add the missing `.dark` tokens, fix the three known
  `.dark` bugs, and hold the line that new surfaces use tokens rather than
  literals." No prior commit, issue, or doc contains it — it was asserted for
  the first time in this line, with no supporting evidence anywhere in the
  diff, the commit message, or a linked issue.
- It was copied verbatim into `prompts/m1-backlog.md` (same session, later
  superseded per that file's own header) and referenced (as "uncited") in
  commit `235462f`, which deprioritised token hygiene on exactly this
  absence of a citation.
- No earlier source exists. The claim was never true in the sense of "three
  specific bugs somebody found" — it was an unverified assertion that
  survived one full docs rewrite before being questioned.

## Decision

The claim is struck from `docs/handoff.md`, replaced with a pointer to this
file. No bugs are filed, because none were substantiated — there is nothing
to fix. The `--font-size`/`--radius` non-gap is recorded here rather than
"fixed," since adding either to `.dark` would be a no-op that duplicates the
`:root` value for no reason.

## What would make us revisit it

If a real `.dark` rendering bug turns up (a component that looks wrong only
in dark mode), file it as its own card — this spike found none, so the
absence of a `.dark`-only bug backlog is not itself evidence of thoroughness
beyond what's checked here: a static diff of `globals.css`, not a rendered
audit of every component in both themes.
