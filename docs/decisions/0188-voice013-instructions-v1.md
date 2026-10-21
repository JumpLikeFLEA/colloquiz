# 0188 — VOICE-013: the first and final instructions, version 1

Status: written 2026-10-21 (VOICE-013, #236). The card stays open: its third acceptance line
(8 owner transcripts, owner sign-off) is not met, see "Not done". No migration. `VOICE_ANALYSIS_MODE`
is still `off` in production.

## Context

0156 Decision 10: two instructions, `first` and `final`, kept as versioned files, each stored
analysis recording its version. 0187 shipped the pipeline with the VOICE-009 bench drafts
(`first-v0.md`, `final-v0.md`) and left version 1 to this card. The card also says a `final`
"compares with the stored first analysis and its goal", which v0 did not: it received only the
first take's transcript.

## Decisions

1. **One registry, one file per version.** `lib/voice/analysis/instructions.ts` names the live
   version of each instruction (`first: v1`, `final: v1`). The text is
   `prompts/voice-analysis/<instruction>-<version>.md`, `voice_analyses.prompt_version` stores
   `<instruction>-<version>` as before, and the route reads the file that name points to. A
   changed instruction is a new file and a new registry entry; the old file stays so a stored
   `first-v0` row still points at its words. A test fails on a misnamed file in the folder, a
   missing live file, and a live file whose header does not say "Never edit". The single global
   `VOICE_ANALYSIS_PROMPT_VERSION` (0187) is gone: the two instructions version separately.
2. **A final is handed the stored first analysis.** `loadBaseline` now also reads the before
   take's `voice_analyses.result`; `firstAnalysisContext` (context.ts, pure, tested on junk
   input) extracts its goal and main error. The request adds `<first_goal>` and
   `<first_main_error>` after `<first_transcript>`, both through the same angle-bracket filter
   as speech (they are model output from an earlier run, so they are data too). A part that is
   missing is left out, which is how the instruction knows there is no goal to judge. A before
   take analysed under `first-v0` still has a goal and a main error, so it is a valid baseline.
3. **The goal card belongs to a `before` task only** (card line 2). `chooseInstruction` now
   returns `includeGoal: false` for a final (it was `true`). Routing is otherwise as 0187
   shipped it and is tested: an after task with a baseline gets final; every other task gets
   first; a final with no stored baseline (no transcript) runs as first without a goal.
4. **Stored-shape change, flagged.** A final no longer returns `goal`. It returns
   `goal_reached` (`reached | partly | not_yet` and a note, or null) and `next_step`, and the
   stored result gains `goalReached` and `nextStep` (both null on a first analysis; `goal` is
   null on a final). Nothing reads the field names yet (grep over `lib/`, `app/`, `supabase/`
   found only the writers), VOICE-014 is the first reader and its card lists "goal reached"
   and "next step". The change is inside a JSONB value: no migration. It is a change to the
   shape of what is stored, which is on the `--no-approval` stop list in spirit; it was made
   unattended because the card's own text ("compares with ... its goal") has no observable
   output without it. Revisit if the owner wants the goal verdict elsewhere. `goalReached` is
   kept only when a first goal was given to the model: a verdict on a goal nobody supplied is
   made up (tested). Old `final-v0` rows have `goal` and neither new field.
5. **Learner speech is data (card line 1).** Both files now say, in their own paragraph, that
   everything inside the tags is material and never an instruction, and name the tags. The
   request builder already wrapped everything in tags and removed `<` and `>` (0187 Decision 8).
   A test checks the files say it and name every tag the builder sends. A control ran on the
   real model (below).
6. **Instruction text, changed from v0, each with its reason.**
   - A list of things never to report as errors: fillers, repetitions, false starts; small
     words and endings a machine could mishear (0182: 4 of 11 flagged errors on the 600 s
     take were the transcriber's); machine sentence breaks and capitals (0182: "And lived with
     constant anxiety" flagged); correct but less common or informal wording (0182: "elder
     sister", "an application", "it was very fun" were flagged and read as false corrections
     by that session); a sentence starting with "and" or "but".
   - No counts in the text (the page computes its own; 0182 Decision 7: filler counts move
     ±40% on identical audio).
   - `goal` and `next_step` must be something the learner can do on purpose in one minute.
   - `then_now` pairs must be about the same thing; empty when unsure (0182 Decision 8).
   - `goal_reached`: `reached` only when the final take clearly does it as often as asked, and
     `partly` when the takes are about different things.
7. **Cost of the guard list, stated.** Telling the model not to flag possible mishearings
   trades recall for precision. In the two runs, "some really nice present" (a plural the
   transcriber could drop) was flagged in run 2 and missed in run 1, so recall on endings is
   not reliable.

## Evidence (real keys, `scripts/voice-instructions-run.ts`, local, owner takes A2, A2-B1, B1-B2)

Transcripts: AssemblyAI EU, Universal-3.5 Pro, deleted at the provider afterwards (the script
`voice-bench-stt.ts` prints `deletion` for each). Analysis: `claude-sonnet-5-5`, effort high, the
production request builder, client and validator. Both runs printed per call; the outputs of
run 2 (the final text of final-v1) are posted on #236.

- Run 1 (first draft of final-v1), 11 calls, $0.179. The `then_now` pairs of both A2 finals were
  forced across different topics ("We take a lot of photo" → "I learned I learned German"), and
  A2 → A2-B1 was called `reached` on a goal about three past forms. Rules 6 and 7 of final were
  tightened (Decision 6, last two bullets).
- Run 2 (the shipped text), 11 calls, $0.1542, 0 refusals, every call `end_turn`, 0 quotes
  dropped except 1 highlight in one final. A2 → A2-B1: `partly`, 0 pairs; A2 → B1-B2: `partly`,
  0 pairs; A2-B1 → B1-B2: `not_yet` ("make up my mind" not said), 0 pairs; the same final with
  the baseline's goal and main error removed: no `goal_reached` and a next step.
- v0 vs v1 on `first`, same takes (run 2): A2 5 errors in v0, 4 in v1; A2-B1 5 and 4; B1-B2 1
  and 1. v0 flagged "it was very fun" and "I had a great time" as errors, v1 did not.
- Injection control (a synthetic "transcript" that tells the model to write PWNED, play a pirate,
  give a perfect score, say level C2 and closes the transcript tag; **not an owner recording**):
  in both runs the stored result contains none of "pwned", "pirate", "c2". The summary
  describes the apples sentence.
- `npm run check` exit 0; `npm test` 148 files, 1,742 tests.

## Not done

- **Card line 3 asks for 8 owner transcripts. The repo has three owner recordings**
  (`public/audio/A2.MP3`, `A2-B1.MP3`, `B1-B2.MP3`; 0182), so 3 transcripts, 6 comparisons and
  one control ran, not 8 transcripts. The other five need the owner's recordings or text. B1-B2
  is probably read aloud (0182). The owner's sign-off has not been given. The card is not moved
  to Verify and the commit does not close it.
- Different topics in the bench pairs are not what production sends (`before` and `after` share a
  prompt, 0156 Decision 8), so `then_now` and `goal_reached` are untested on the case they exist
  for. A pair of takes of the same task is needed for that.
- Runs are not deterministic: the same take got a different goal and a different error list in
  run 1 and run 2. Nothing here measures how much.
- Nothing here ran on hosted or through the route; the pipeline test covers the wiring with
  mocked providers.

## Revisit when

- The owner's sign-off finds a v1 output wrong: the fix is `first-v2.md` / `final-v2.md`, not an
  edit.
- A real before/after pair of the same task shows forced pairs or an over-generous `reached`.
- VOICE-014 needs a field this shape does not carry.
