# 0216 — OPS-038: where the free lesson's +2.3 KB from PLAY-019 came from

Status: measured unattended (`work on next --no-approval`), 2026-11-02. Issue #283.
Acceptance 3 (2 KB of headroom back) is NOT met; see "Open".

## Context

0210 "Measured" recorded `/courses/future-imperfect/true-or-false` moving from
257.0 to 259.3 KB for PLAY-019 (7951949), more than the code added would suggest.

## Method

Same machine, same `.env.local`, same local stack. For each of `7951949^`
(c9081dd) and `7951949`: `rm -rf .next`, `next build`, `next start -p 4173`, one
cold Chromium load of the route with the cache off, summing
`Network.loadingFinished.encodedDataLength` per script URL (the budget guard's
method, `scripts/budget.ts`, split per chunk). Chunk bodies copied from
`.next/static/chunks` for each build. The per-chunk script was a scratch file,
not committed.

## Measured

Total script bytes: before 264297 B (258.10 KB), after 266754 B (260.50 KB),
+2457 B. (Absolute figures are ~1.1 KB above 0210's, which was a different
run; the delta is the finding.) Twelve of the fifteen scripts before (sixteen after) are
identical in size and name. The rest:

| before | B | after | B |
|---|---|---|---|
| `0hlqtgz-iytuz.js` | 17323 | `16vtj92wrmynp.js` | 12112 |
| | | `0obgwm-cij54j.js` | 7641 |
| `0ip_udp4nnq2w.js` (alliengllCopy, schemas) | 8751 | `13yqatcipmh2w.js` | 8778 |
| sum | 26074 | sum | 28531 |

`0hlqtgz` held, in one chunk, the lesson page's client modules (icons, the
attempt store, `parseOpens`, `bestPercentForVersion`, the width classes) and
`LessonPlayer` with `practiceRenderer` and `PracticeBlockPlaceholder`. After the
change the last three are a chunk of their own (`0obgwm`, module ids 923766,
877184), and the rest stays in `16vtj`.

Raw size of that chunk group: 49600 B before, 50809 B after (+1209 B raw). The
copy chunk grew 69 B raw (the "Answered before" string).

Re-compressing the same bytes at gzip -9: the old chunk 16067 B; the two new
chunks 10868 + 6448 = 17316 B separately, 16373 B concatenated. So of the
group's growth, about +306 B is code PLAY-019 added and about +943 B is the
split, i.e. two compression contexts instead of one. The wire figures above
(+2430 B for the group) are larger than the gzip -9 figures because the server
compresses at a lower level; the proportion is the same.

## Decisions

1. **The growth is mostly a chunk split, not new code.** By the gzip -9 check
   roughly three quarters of the group's growth is lost compression, one
   quarter is PLAY-019's code. The split is measured; the wire-level
   attribution rests on the gzip -9 re-compression above, not on the server's
   own level.
2. **Why Turbopack split `LessonPlayer` off is not established.** Hypothesis,
   unverified: PLAY-019 enlarged the player's module graph past a size at which
   Turbopack places it in its own chunk. Nothing in the diff adds a new
   importer of `LessonPlayer` (page.tsx imports only `LessonPageClient`; the
   diff adds type imports and `answeredBefore`). Do not act on this as a fact.
3. **Headroom.** `npm run budget` at HEAD (6fd5873), this machine: `/courses/
   future-imperfect/true-or-false | 260.5 KB | 260 KB  OVER BUDGET`. The
   signed-in routes could not sign in here (the `prog00*` fixture users are not
   seeded in this stack), so they printed FAIL, before and after, unrelated.

## Open

Acceptance 3 is not met. The route is 0.5 KB over its 260 KB budget on this
machine at HEAD, and no change was made to regain space. Levers, none tried:

- Make the split not happen (same code, one chunk, +0.3 KB instead of +2.4 KB).
  Needs an experiment per import-graph change; Turbopack's rule is not documented
  in `node_modules/next/dist/docs`, so each is a build and a measure.
- Cut bytes: `alliengllCopy` is ~26 KB raw in a chunk this route downloads whole.
- Raise the budget to the measured figure plus headroom (the PLAY-012 precedent).
  A budget change is the owner's call.

## Revisit

When the next change to the player lands, re-run the per-chunk comparison; a
second split is the signal to spend the experiment.
