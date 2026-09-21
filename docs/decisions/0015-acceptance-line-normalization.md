# 0015 — acceptance-line matching tolerates punctuation variance

## Context

OPS-005 (issue #61): `checkedAcceptanceLines` (`scripts/board/bootstrap-
board.mjs`) matched a live issue's ticked acceptance lines against
`backlog.mjs`'s canonical text by exact string equality. Any punctuation
normalisation GitHub or a hand-edit applies to the live line — a dash form,
a smart quote, trailing whitespace — makes it stop matching the canonical
text byte-for-byte, so the next `bootstrap-board.mjs` run silently renders
that line unticked in the regenerated body, discarding completed-work
status with no error and no log line calling it out.

## Decision

`normalizeAcceptanceLine(text)` collapses exactly the punctuation classes
the card names, and nothing else:

- Any dash character (ASCII double-hyphen `--`, en dash U+2013, em dash
  U+2014, and the other Unicode dash-punctuation code points U+2010–U+2015
  plus the minus sign U+2212) becomes a single ASCII `-`, and a run of two
  or more resulting hyphens collapses to one — so `--`, `–` and `—` all
  normalise identically. This only affects genuine dash punctuation, not a
  hyphen inside a compound word (`multi-answer` has exactly one hyphen to
  begin with, so nothing collapses).
- Smart single quotes (`'` U+2018, `'` U+2019, `ʼ` U+02BC) become the
  straight `'`; smart double quotes (`"` U+201C, `"` U+201D) become the
  straight `"`.
- Leading/trailing whitespace is trimmed.

Both sides of the comparison are normalised: `checkedAcceptanceLines` keys
its Set by the normalised live-issue line, and `cardBody` looks up the
normalised canonical text. Normalising only one side would still miss a
match whenever the OTHER side (whichever wasn't normalised) was the one
that varied.

Nothing else is touched: a genuinely reworded acceptance line normalises to
a different string and still renders unticked, because the words differ,
not just their punctuation. This is the card's third acceptance line, and
it holds by construction — `normalizeAcceptanceLine` never touches
alphanumeric content.

`main()` in `bootstrap-board.mjs` is now guarded by an argv check (the same
pattern `scripts/session/context-guard.mjs` already uses for the same
reason — OPS-002), so `checkedAcceptanceLines`/`normalizeAcceptanceLine` can
be imported and tested without the import itself shelling out to `gh`.

## What would make us revisit this

- A real backlog line needs a dash or quote character preserved literally
  as content (not as punctuation) — none currently do; `normalizeAcceptanceLine`
  would need a narrower character class if one ever does.
- A punctuation class other than dash/quote/whitespace turns out to vary
  between the canonical text and GitHub's echo (e.g. straight vs.
  full-width parentheses) — extend the function's character classes rather
  than adding a second normalisation pass.
