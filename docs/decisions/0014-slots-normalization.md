# 0014 — slots: typed-answer normalisation

## Context

ITEM-007 (issue #55) implements the `slots` item type (cloze, word
insertion). Its own acceptance calls this decision "the substance of the
card": get it wrong and a correct answer is marked wrong, which
`docs/handoff.md` names as the single worst outcome for a beginner learner —
worse than being lenient, because it is silent and the learner has no way to
tell "I was wrong" from "the app disagreed with a legitimate answer".

`lib/scoring.ts`'s existing `isCorrect()` (Colloquiz's old free-text
comparator) is untouched by this card — the item registry is a parallel
path, per ITEM-007's own notes, because an existing Psychology question's
`correct_answer` is `"$500"` and changing that comparator's behaviour is its
own card, not a side effect of this one.

## Decision — the normalisation pipeline

Both a submitted answer and every one of a gap's authored `acceptedAnswers`
are run through the same function before comparison — normalising only one
side would make "the accepted answer itself needs the rule applied" cases
(an authored answer typed with a curly apostrophe, say) silently wrong.
Applied in this order:

1. **Leading/trailing whitespace** — trimmed.
2. **Internal whitespace** — any run of whitespace collapsed to a single
   space (`"New   York"` reads as `"New York"` — a mobile keyboard's
   autocorrect or a double space-bar tap is not a different answer).
3. **Curly apostrophes** — U+2018 (`‘`), U+2019 (`’`) and U+02BC (`ʼ`) are
   rewritten to the straight U+0027 (`'`). This is the specific case the
   card names: a phone keyboard's autocorrect (English or Russian layout)
   substitutes the typographic apostrophe for the straight one the author
   is likely to have typed, and the two are visually near-identical to a
   learner. Only these three code points are rewritten — not a general
   Unicode-confusable table, which would start to look like fuzzy matching.
4. **Trailing punctuation** — one or more of `. , ! ? ; :` at the very end
   of the (already trimmed) string are stripped, then the result is
   trimmed again (stripping `"cat !"`'s `!` leaves a trailing space that
   the first trim never saw). Only trailing punctuation; a leading or
   internal character from this set is left alone; a stripped answer like
   `"$500"` keeps its leading `$` — normalisation removes end-of-sentence
   noise, not content.
5. **Case** — both sides lowercased last, so casing never interacts with
   step 3's character rewrite.

Implemented as `normalizeSlotAnswer` in `lib/items/slots.ts`, applied
symmetrically to the response and to every `acceptedAnswers` entry at
comparison time (not at parse/authoring time, so the authored value stored
and shown back to a reviewer is never silently rewritten).

## Explicitly out of scope (per the card)

- **Fuzzy matching / typo tolerance / stemming.** A near-miss (`"colur"` for
  `"colour"`, `"runing"` for `"running"`) is wrong in v1. The explanation
  attached to the gap is what carries the correction — see
  `docs/handoff.md` ("Every mistake gets an explanation"). No case for this
  was argued during the card, so the default (out of scope) stands.
- **Unicode confusables beyond the apostrophe set above** (e.g. Cyrillic
  look-alike letters such as а/a, е/e). Not named by the card, and
  resolving it would need a much larger table with its own false-positive
  risk (rejecting a deliberately different word that happens to look
  similar) — a case for a future card, not assumed here.
- **NFC/NFD Unicode normalisation** for combining-character sequences.
  English gap answers in this content are plain ASCII in practice; not
  named by the card's rule list, so left out rather than guessed at.

## What would make us revisit this

- A real authored batch surfaces answers where a rule in this list produces
  a false positive (marks a wrong answer correct) or false negative (marks
  a right answer wrong) — either is evidence the rule needs to change, not
  a reason to add a new one speculatively.
- A future card argues explicitly for typo tolerance or a wider confusable
  table, with the false-positive risk weighed against the false-negative
  cost this decision optimised for.
