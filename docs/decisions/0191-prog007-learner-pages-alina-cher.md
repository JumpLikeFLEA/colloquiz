# 0191 — PROG-007: `/my` and the before/after screen in the Alina Cher look, with the AI feedback

Status: written 2026-10-22 (PROG-007, #245). No migration. `VOICE_ANALYSIS_MODE` is still `off` in
production: with it off neither page reads or draws any AI feedback, and both read as before apart from
the new look.

## Context

0156 Decisions 3 and 13: the learner's own pages carry the new look (0163 tokens, the vocabulary 0165
and 0166 set) and the AI feedback (0189's view). `/my` and `/runs/[runId]` were the last English
pages on the gradient band (0166 Decision 1 named them).

## Decisions

1. **Grid paper, as the course and lesson pages.** `<main className="grid-paper">`, `BandTopBar` and
   `AccountMenu` in `tone="paper"`, a yellow eyebrow pill and a `font-display` title in place of the
   gradient band. Cards use `PAPER_CARD_CLASS` (tappable) and `PAPER_PANEL_CLASS` (static), the
   numeral tile is the lesson row's yellow tile, `SectionHeading` takes `display`, the level pill is
   the yellow one, and a course with no cover gets `CourseCard`'s grid-paper level tile. Empty boxes
   are `border-2 border-dashed border-ink/40`, `LessonCompletion`'s. No new tokens or hex literals.
   `/my/messages`, `/my/messages/[teacherId]`, `/my/settings`, `/invite` and `/join` keep the gradient
   band (see "Not done").
2. **`/my` lists the learner's analysed takes.** A section "AI feedback on your recordings" between
   Teachers/Reminders and the human Feedback: one row per finished, shown analysis (newest take first,
   at most 12), with the course · lesson, a "Recording" or "Final recording" pill, the local time, and
   the whole row a link to that lesson, where the feedback itself is drawn (0189). It is one read under
   the learner's own session: `voice_submissions` with `voice_analyses!submission_id!inner`
   (`voice_analyses` has two foreign keys to a take, the take and a final's baseline, so the embed
   names its key), filtered `user_id = me`, `status = done`, `hidden_at is null`. `user_id = me` is not
   redundant: an editor's "editor read" policy returns other learners' takes, shown below. The section
   is left out when the list is empty, when the mode is `off` (no read is made), and when the read
   fails (logged, like Messages). A row whose lesson is no longer readable is the same row with no link.
   The pure mapper is `lib/voice/analysis/learnerList.ts`, tested.
3. **`/runs` shows the final analysis beside the final comment.** For a recorded After take, the page
   asks the status route's own question through the same code (`readAnalysisStatus` over
   `statusDeps`, which moved from the route into `lib/voice/analysis/statusDeps.ts` so the second
   caller does not re-decide it). `lib/voice/analysis/finalView.ts` maps the answer to what a page
   that cannot poll draws: `done` the view (with the first take's feedback under "Day 1 feedback" when
   it still reads), `working` "still being prepared, reload in a minute", and `failed`, `withdrawn`,
   `paused` and `limit` with 0189's own copy; `none` and `off` draw nothing. The two sit side by side
   from `lg` (analysis left, comment right) and stacked below it; with no analysis the comment keeps
   the reading width. Every stored string is still a React text child (0189 Decision 7). A purged
   After take has no analysis (it goes with the take), so the card is absent there.
4. **`parseStoredAnalysis` moved to `lib/voice/analysis/parseStored.ts`** and `AnalysisResult` is
   loaded with `next/dynamic` on `/runs`; both for the budget (below). `view.ts` is now free of the
   schema library, so the browser-side view code no longer pulls it. The lesson page, which parses in
   the browser, and Studio import `parseStored` directly; behaviour is unchanged (the 23 voice test
   files pass, and the VOICE-014 run below passes again).
5. **Seed.** `scripts/seed-local-fixtures.ts` gains a second COH-005 run that started 23 days ago, a
   learner (`prog007-learner@example.com`) enrolled in it, both takes recorded and analysed (a first,
   then a final compared with it) and a published final comment. It is a second run, not an edit of
   the first: the first starts in the future, so its week-four lesson is not open and the After slot
   reads "not open yet". The start is taken once, when the run is first inserted; an enrolment insert
   needs a run that has not ended (058 `run_ended`), and an existing enrolment stays valid after it
   ends. `scripts/budget.ts` has two new entries for this learner.

## Evidence (local stack, `next start`, `VOICE_ANALYSIS_MODE=on`; no AI provider called)

- `scripts/prog007-local-run.ts check`: `PROG-007 PASS: /my list, /runs final analysis, and each
  denial` (20 cells). Learner A (a done, a hidden and a failed analysis) sees exactly the done one;
  B sees only B's own and E sees only E's own, with each own-row cell as the control for the others'
  absence. E is an editor of the course, and the control cell shows E can read 5 analyses directly
  under RLS, so it is the `user_id` filter that keeps the others off E's list. Signed out `/my`
  redirects. On `/runs`: the fixture learner draws the final analysis, the comment beside it and the
  Day 1 disclosure (control); a learner not enrolled in the run gets 404 with no analysis; signed out
  gets the sign-in card; hiding the After analysis reads "withdrawn" with no transcript in the HTML and
  is restored afterwards (the restore cell passes). A second server with the mode `off`: `/my` has no
  section and `/runs` draws the recordings and the comment and no AI feedback.
- Re-run of the earlier script for the code this card moved: `scripts/voice-view-local-run.ts`,
  `VOICE-014 PASS: status route, every state and its denial`.
- Cleanup: `{"before":{"submissions":5,"ledger":5,"courses":1},"after":{"submissions":0,"ledger":0,
  "courses":0}}` (PROG-007) and `{"before":{"submissions":8,"ledger":8,"courses":2},"after":
  {"submissions":0,"ledger":0,"courses":0}}` (VOICE-014); no `p7-` or `v14-` user or course remains.
  `seed-local-fixtures.ts` run twice: one analysis per take, two ledger rows, one comment.
- 360px (`npm run viewport360`, `scrollWidth/innerWidth`): `/my` as the fixture learner with the list
  360/360 (EN), 360/360 (RU, saved choice), 360/360 for a learner with no analysis; `/runs/<run>` signed
  in with the analysis 360/360, signed out 360/360, signed in on the mode-`off` server 360/360. Edge
  at 1280px, light and dark: 1280/1280, and the screenshots were read (analysis left, comment right,
  readable in dark).
- `npm run budget` (local stack, mode on, signed in as the learners; the same runs measure every
  route), before this card's app changes and after:

  | route | before | after | budget |
  |---|---|---|---|
  | `/my` (prog002) | 174.4 | 174.4 | 180 |
  | `/my` (prog007, with the list) | 174.4 | 174.4 | 182 (new) |
  | `/runs/<run 1>` signed out | 176.3 | 180.7 | 184 |
  | `/runs/<run 2>` signed in, analysis drawn | 176.3 | 171.0 | 179 (new) |
  | every other route | unchanged | unchanged | |

  The first attempt (a static import of `AnalysisResult`, with the schema library still in `view.ts`)
  measured 245.3 KB signed out and 235.6 signed in. The analysis view's chunk after the split is
  5.7 KB compressed and holds no zod (`14ge...js`: "One thing to fix" and no "ZodError"); the chunk
  that holds "ZodError" is a separate 283 KB file the page no longer loads. That the library came in
  through `view.ts` follows from `view.ts` importing zod at module level (read in the file); the
  245 to 180 KB change is the measurement of the split plus `next/dynamic`, not separated further.
- `npm run check` exit 0; `npm test`: 156 files, 1,846 tests passed.

## Not measured / known limits

- Why `/runs` signed in (171.0) is smaller than before (176.3) and than signed out (180.7): the two
  contexts load different sets of scripts (15 and 14 in a Playwright probe, and the signed-out set
  includes the analysis chunk too, because `next/dynamic` in a Server Component preloads it whether or
  not it renders). Not traced further; both figures are inside their budgets.
- A phone or an in-app browser; a signed-in session with a long course title; the `working`,
  `failed`, `paused` and `limit` states of the `/runs` card in a browser (the mapper is unit-tested,
  `withdrawn` was checked in HTML); the calendar and reminder cards on `/my`, which are shared with
  Studio and keep their old frame.

## Not done (proposed cards)

- `/my/messages`, its thread page, `/my/settings`, `/invite` and `/join` still carry the gradient band
  and now sit beside paper pages. 0166 named them as this card's; the acceptance line names only `/my`
  and `/runs`, so they are left and proposed as one card.
- The calendar, feed and Telegram reminder panels on `/my` keep their plain frame (shared components).

## Revisit when

- A real analysis from the providers draws badly in the narrower half column at `lg`.
- A learner wants the list to go beyond 12 takes.
- The five pages above move to paper: the `GradientBackdrop` and `GLASS_PILL_CLASS` uses can then go.
