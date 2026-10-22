# 0189 — VOICE-014: the learner's AI feedback view

Status: written 2026-10-22 (VOICE-014, #239). No migration. `VOICE_ANALYSIS_MODE` is still `off`
in production, and with it off the lesson page downloads and draws exactly what it did before.

## Context

0156 Decisions 1, 5 and 8 put the analysis in front of the learner at once, in English, inside the
voice-task card. 0185 and 0187 stored and produced it and left this card the reads and every state:
the status route answers `none` for a hidden analysis, a cohort send past a cap has no row at all,
and a paused send has had its row deleted (0185 Surprises, 0187 "VOICE-014 requirement").

## Decisions

1. **No migration: a service-role read answers the three states RLS hides.** 0185 proposed a
   SECURITY DEFINER function returning "withdrawn". The status route (`lib/voice/analysis/status.ts`,
   `app/api/voice/submissions/[id]/analysis/route.ts`) instead proves the take is the caller's with
   the caller's own session (RLS plus `user_id = caller`), and only then reads `hidden_at` and the
   send ledger with the service role, returning a state word and nothing else. A schema change is on
   the `--no-approval` stop list; this needed none. Verified (below): a stranger asking about the
   same take gets `none` and no key but `status`, with the owner's answer beside it as the control.
   Revisit if a second reader needs "withdrawn" (Studio's list, VOICE-015, reads under the editor
   policy and does not need it).
2. **State words.** `pending | transcribing | analysing | done | failed` as before, plus
   `withdrawn` (a hidden analysis), `limit` (ledger `analysed = false`: a cohort send past a cap,
   0185 Decision 4), `paused` (ledger `uncounted_reason = 'paused'`), `off` (the mode is off) and
   `none`. `done` also carries the transcript (the offsets are into it) and, for a final, the
   first take's transcript and result, read under the caller's session so a hidden first analysis
   simply is not there. The baseline's id (`baseline_submission_id`, ungranted) is read with the
   service role, for the owner only.
3. **The view exists only while the mode is not `off`.** The lesson page's voice context gains
   `analysis` (mode ≠ off) and `slot` (`lib/voiceTaskContext.ts`). Without `analysis` the recorder
   mounts no panel, makes no request, and the card has no "Try to use" list, so production before
   OPS-027 is unchanged. The panel is a `next/dynamic` chunk (`ssr: false`) inside the voice
   block's own chunk.
4. **Polling.** 2, 2, 3, 4, 5, 8, 12 then 15 s; it stops once settled, gives up after five minutes
   ("taking longer than usual", the daily sweep fails the row later), retries after a failed
   request and says so, and pauses while the tab is hidden: the pending wait is cancelled when the
   tab hides and one request goes out when it shows again. A tab that mounts hidden asks for
   nothing until shown. (A bug found by the test: a wait already running at the moment of hiding
   fired anyway.)
5. **What is drawn, in order:** "AI feedback" label (privacy policy §12 promises it on every
   piece, so it sits on every state); "What worked" (`summary`); count cards computed from the
   items that survive parsing (errors, good moments, hesitations, expressions "x of y" only when
   the author listed some), with "was N" from the first take on a final; the transcript with marks
   and a tap-to-explain; the expressions used and, where the list is not withheld, those not used
   yet; "One thing to fix" and "All errors (n)"; "How it sounds"; the goal (first) or the goal
   verdict, then/now pairs and next step (final); and a collapsed "Day 1 feedback" holding the
   first take's whole feedback. The counts are what was marked, not a score (0156 Decision 1): no
   colour judges them.
6. **Overlapping marks (validate.ts left this to the view).** A stretch claimed by an error, a
   highlight and an expression is drawn as the error, then the highlight, then the expression.
   The one that loses keeps its row in the lists below; it only has no run of its own in the
   transcript. Marks are told apart by underline style as well as colour, and a key names each kind
   shown. Errors use the `warning` set, not `destructive`: nothing here is a failed item.
7. **Everything is a React text child.** The parser (`view.ts`) reads the stored JSONB defensively
   (a missing field is absent, an item whose offsets no longer spell its quote is dropped, a list
   with a bad member keeps the rest) and nothing is ever set as HTML. A test renders a quote and a
   note containing `<b>` and `<i>` and finds no element.
8. **"Try to use" (0156 Decision 8).** On every task except a `before` task, while the analysis
   is on, the author's `listenFor` list shows as yellow chips (`bg-highlight`) under the task's
   limit line; practice mode shows it too. A `before` task shows no list, and the view also
   withholds the "not used yet" names there (a before take can be recorded again, so naming the
   unused ones would taint the baseline; the used ones are shown, since they were said).
9. **Limits met at sending.** The submit route's 429 `voice_cap` was read as "try again". The
   recorder now maps it to `capped` and shows the cap's own line, "This recording was not sent",
   the per-task or the daily limit, and for the daily one the local time a place frees up. The
   take stays in the list. A cohort send past a cap is accepted, so the `limit` state says "AI
   limit reached; your teacher will still answer." on a cohort course (a self-paced learner cannot
   reach that state: the send is refused).
10. **A self-paced learner reads "Sent." and a cohort learner "Sent. Waiting for feedback."**
    (the teacher's feedback is what a cohort learner waits for beyond the AI's).
11. **Wording.** All English, in `lib/alliengll/voiceAnalysisCopy.ts` (the view's chunk) and
    `voiceCopy.ts` (the recorder side, so the view's strings stay out of the recorder chunk).
    Pending partner/owner review like every new copy.

## Evidence (local stack, `scripts/voice-view-local-run.ts`, no AI provider called)

- Seed: one self-paced lesson with a block per state (first done, final done with the first as
  baseline, analysing under a future lease, failed, withdrawn, paused) and a cohort lesson with a
  `limit` take and a take with an analysis and published feedback. `check` against `next dev`
  (mode on): `VOICE-014 PASS: status route, every state and its denial` (18 cells): owner reads each
  state; a stranger reads `none` with no transcript or result for five of them; signed out 401; a
  malformed id reads `none`, not 500; the owner's own session cannot read the hidden analysis
  directly (so the service-role read is what makes "withdrawn" answerable) while it reads the done
  one (control); the analysing row was not claimed by the poll.
- Cleanup: 8 takes, 8 ledger rows, 2 courses before, 0 after; the one `voice_submissions` row that
  existed before the run is untouched.
- 360px (`npm run viewport360`, signed in as the learner, `--expect="AI feedback"`):
  `scrollWidth/innerWidth` 360/360 on the self-paced lesson (every state above on one page,
  first and final results, the Day 1 disclosure closed) and 360/360 on the cohort lesson;
  1280/1280 at 1280px; 360/360 with a mark tapped open (Edge script, cohort lesson). Not
  measured: a result with every disclosure open, dark mode, the daily-cap notice in a browser
  (unit-tested), and a phone.
- `npm run budget` (local stack, signed in as the learner, a lesson whose learner has sent takes):
  free lesson `/courses/future-imperfect/true-or-false` 256.5 KB before and after;
  self-paced voice lesson and cohort voice lesson 326.4 KB before, 327.0 KB after with the mode off
  (the loader and the recorder's strings), 333.6 KB after with the mode on (the panel chunk,
  +6.6 KB, fetched only when a sent take is drawn). The `@supabase/ssr` signature warning on those
  two lessons is in the "before" run as well (a signed-in lesson page), not from this card.
  Those two voice routes are not in `ROUTES`: their slugs are per-seed; temporary entries were
  used and removed.
- `npm run check` exit 0; `npm test` 153 files, 1,814 tests.

## Not measured / known limits

- An inline marked phrase is not a 44px target (it cannot be one without breaking the line). The
  full error list under "All errors" and the main-error card carry the same content without a tap.
- Nothing ran against a real analysis from the providers or on hosted; the stored results in the
  harness are hand-written in validate.ts's shape.
- The in-flight request at the moment a tab hides finishes and then pauses; unit-tested through
  the visibility event, not in a backgrounded real tab.
- The stalled message appears after five minutes of polling; a learner who reloads starts
  polling again from the first state.

## Revisit when

- A real analysis from the providers draws badly (long quotes, many overlapping marks).
- Studio (VOICE-015) renders the same view: it will want `ViewAnalysis` and `AnalysisResult`
  without the polling hook, which is already separate.
- The owner wants the hidden state through a definer function after all (Decision 1).
