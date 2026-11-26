# 0242 — PROG-015: ways into the notebook

Status: built 2026-11-26 (#333). No migration. It builds 0236 section 7's pick and 0235's ways in.

## Decisions

1. **`/my`'s AI feedback list is removed,** as 0236 section 7 recommended and the owner picked
   (2026-11-25). Its reader `getLearnerAnalyses` and `lib/voice/analysis/learnerList.ts` (and its test)
   had no other caller and are deleted. The kind it showed (first / final / interim) is on the
   notebook's recording row since PROG-014. The cost 0236 named stands: one tap from `/my` to a take's
   feedback becomes three.
2. **The `/my` link is a row card first under the header,** before Up next, never inside it (Up next
   is capped at three ranked rows, 0211). It shows for every signed-in learner: an empty notebook has
   its own invitation (0240).
3. **The lesson's link sits in `VoiceAnalysisPanel`'s done branch,** after the disclaimer, not in
   `AnalysisResult`, which Studio and `/runs` also draw. A done analysis is what 112 copies. A result
   that does not parse (shown as a failure) gets no link.
4. **The course-complete link shows when `course.attempts` is not null,** which the lesson page sets
   exactly for a signed-in learner (`attempts: lesson.isSignedIn ? summary : null`). An anonymous
   finisher's card is unchanged.
5. **The two lesson strings are English** (lesson chrome, 0080 Decision 5) in their own module,
   `lib/alliengll/notebookLinkCopy.ts`, imported only by the two lazy chunks. The free lesson is at
   259.9 of 260 KB, so nothing could be added to its first load.
6. **`resendNote`** now reads "…replaces the recording you sent, and removes what your notebook kept
   from it." True whether or not a copy was made.

## Measured (local stack, `next build` + `next start`, `VOICE_ANALYSIS_MODE=on`)

`npm run budget`, before and after: free lesson 259.9 / 259.9 KB (260), applied-practice 287.7 /
287.7 (290), `/my` 175.2 / 175.2 (180) and 175.2 / 175.2 (182, the learner with two analysed takes),
`/my/notebook` 166.5 / 169.3 (180, PROG-016's form); every other route unchanged. The list was a
Server Component's markup, so removing it saved no script bytes.

No `budget.ts` route loads the analysis chunk, so a scratch script measured
`/courses/coh005-fixture/week-one` signed in as `prog007-learner` (two finished analyses), cold and
cache-disabled, after the panel rendered: 343.2 KB before (waiting for "What worked", twice) and
344.0 KB after (waiting for "Open notebook", shown twice, twice).

At 360px (`npm run viewport360` and Edge): `/my` 360/360 EN and RU with the link text expected, and the
AI list's title absent; the voice lesson 360/360 with "Open notebook"; the course-complete card
360/360 signed in (a scratch local user, one lesson's attempts seeded, the other answered; link to
`/my/notebook`) and 1280/1280, and 360/360 anonymous (the store seeded, 0 links); the resend note
360/360 after recording again with Edge's fake microphone. The scratch user and its attempts were
deleted (0 left).

Not measured: a phone, dark mode, the lesson in RU (its chrome is English).

## What would make us revisit this

- Learners miss the one-tap way from `/my` to a take's feedback.
- The lesson's link is tapped by learners whose notebook turns out empty (a copy failing at scale:
  0236's sweep warnings).
