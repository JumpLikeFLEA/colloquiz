# 0130 — PLAY-013: gap check marks take no inline space

## Context
`SlotsRenderer` inserted a ✓/✗ after each typed gap only on Check, re-wrapping
sentences (measured before the change: 6 of 17 typed gaps on
`/courses/future-imperfect/grammar-drilling` moved at 1440px, 7 of 17 at
360px). e0f81b7 fixed the same for True/False rows by reserving the slot.

## Options
1. Reserve an invisible slot after every gap (as e0f81b7). Rejected: leaves
   visible space after every blank in the unanswered sentence.
2. Absolutely position the mark on the gap. Chosen: takes no flow space.
3. Replace the mark with colour only. Rejected: handoff rule, never colour alone.

## Decision
Option 2 for typed and drag gaps; "Gap N:" label `mt-2.5` → `mt-4` to share
"Why?"'s centre line.

## Evidence
Before/after run, Edge headless, relative gap positions: after = 0 of 17
moved at 1440 and 360; label/Why centres 443/443. Drag variant not measured
(no published item uses it).

## Revisit if
The mark overlaps a following punctuation mark in authored content.
