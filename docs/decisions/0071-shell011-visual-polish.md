# 0071 — SHELL-011: visual polish pass on the English surface

## Context

SHELL-011's acceptance is "Typography, spacing and the player's look," with
no further specification — it is the M2-end "brand and aesthetic polish"
slot named in docs/handoff.md's "Visual work" §3. An audit of
`app/(english)/**` and `app/components/lesson-player/**` before making any
aesthetic judgment call found a concrete, pre-existing defect that dominates
anything cosmetic: **most of the player's visible chrome was hardcoded
English**, on a surface whose whole learner-facing chrome is specified as
Russian (docs/handoff.md, "Audience and language", 2026-09-24 delta).

This was already flagged once and left unaddressed: docs/decisions/0058
("PLAY-007 — lesson completion screen") found the top progress banner's
hardcoded "Progress: X% (…)" and proposed fixing it as a follow-up card,
scoped narrowly to that one banner because it predated PLAY-007 and wasn't in
that card's acceptance. This card is that follow-up, generalised: the same
defect turned out to be systemic, not confined to that one banner —
`lib/alliengll/copy.ts` already carried unused Russian entries for some of
these strings (`player.submit`, `player.why`) that nothing had ever been
wired up to read.

## What was found (audit, before any fix)

Every practice renderer's "Submit" button, and a long tail of other chrome
strings, were English literals with no `alliengllCopy` import at all:

- `SelectionRenderer`, `SelectionGridRenderer`, `OrderingRenderer`,
  `MatchingRenderer`, `BucketRenderer`, `SlotsRenderer` (×2): "Submit"
- `SelectionGridRenderer`: "True" / "False" row buttons
- `OrderingRenderer`: "Hold and drag the handle to reorder."
- `MatchingRenderer`: "Tap to match" (empty-slot button)
- `BucketRenderer`: "Return to pool", "All statements sorted", "Correct:
  <bucket>" note
- `SlotsRenderer`: the fallback "Gap N" row label, the "Gap N:" explanation
  prefix, "Clear", "All words placed"
- `ExplanationDisclosure` (shared by every renderer's "Why?" control):
  "Why?" / "Hide" — ignoring the already-existing, unused
  `alliengllCopy.player.why`
- Theory blocks: `ExampleBlock`'s default "Example" label, `SelfCheckBlock`'s
  "Your answer" placeholder / "Model answer" label / "Show model answer"
  button, `VideoBlock`'s iframe title / play `aria-label` / "Click to play
  video" caption
- `LessonPlayer.tsx`'s own progress banner (the one 0058 named) — still
  unfixed

Screen-reader-only `aria-label`s that interpolate authored content (e.g.
`` `Drag to reorder "${text}"` ``, `` `"${text}" in this gap — tap to select,
or drag to move` ``) were left as English. Translating those meaningfully
needs more Russian phrasing than a mechanical swap, and they are not part of
what a sighted learner reads — deferred rather than guessed at here.

## Decision

1. Fixed all of the above by adding the missing keys to `lib/alliengll/copy.ts`
   (`player.*` for practice chrome, a new `theory.*` group for theory-block
   chrome) and wiring `alliengllCopy` into every listed component. No new
   copy convention: same flat, Russian-only, no-i18n-library shape the file
   already uses.
2. `LessonPlayer.tsx`'s progress banner now reads
   `alliengllCopy.completion.scoreLabel` — the exact same string
   `LessonCompletion` already uses for its own score line — rather than a
   new banner-specific key, so the two can never drift into different
   wording again. The banner and the completion box now legitimately show
   the same line twice on a fully-scored lesson; this is UNCHANGED
   structure (the banner already existed before PLAY-007 added the
   completion box, per 0058), just now in one language instead of two —
   not a new duplication introduced by this card, and not addressed here
   (removing it would be a layout decision beyond this card's scope).
3. Typography: lesson headings (`HeadingBlockView`) gained an `lg:` size
   step (`text-lg` → `lg:text-xl` for level 1, `text-base` → `lg:text-lg`
   for level 2), matching the precedent decision 0043 already set for body
   text (`THEORY_BODY_TEXT_CLASS`'s `text-sm lg:text-base`) when the column
   grew to `max-w-5xl` at `lg` — headings hadn't scaled with that change and
   read small against the wider column. `LESSON_COLUMN_CLASS`'s inter-block
   gap grew `gap-4` → `lg:gap-6` for the same reason. Both are `lg:`-only;
   nothing changes below 1024px.
4. Every renderer test asserting an English button/label name (`"Submit"`,
   `"Why?"`, `"True"`, `"Return to pool"`, `"Correct: …"`, `"Hold and drag…"`,
   `"Gap N:"`) was updated to the new Russian string it now renders.

## What would make us revisit it

- If the interpolated `aria-label`s above are found to matter in practice
  (a screen-reader user reports them), translate those too — they were
  deferred for scope, not judged unimportant.
- If the progress-banner/completion-box duplication is ever felt as visual
  clutter rather than a helpful recap while scrolling a long lesson, that is
  a layout decision for a future card, not a language one — this card only
  fixed which language the duplicate says.
