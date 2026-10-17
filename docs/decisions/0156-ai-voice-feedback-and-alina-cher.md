# 0156 — AI voice feedback on every course, and the Alina Cher redesign

Status: decided by the owner in a planning interview on 2026-10-17. Nothing is
built yet. The work is split into M4 cards VOICE-009..016, OPS-026, OPS-027,
VIS-003, AUTH-020, SHELL-025..030 and PROG-007 (`scripts/board/backlog.mjs`).
**Production stays as it is today until OPS-026's legal revision is
published** (Decision 13).

## Context

The owner brought two inputs.

The first is a set of screenshots. Two show a redesigned landing hero (RU and
EN): "Alina Cher — английский с умом", grid paper, a yellow marker, a
hand-drawn oval, a comic panel and a Day 1 / Day 7 audio card. Two show a
"Voice message feedback" test bench.

The second is a step-by-step description of the pipeline the bench
prototypes:
1. The student records on the platform.
2. A speech-to-text service transcribes the take and keeps the disfluencies.
3. "Analyze" sends the transcript, the lesson chunks and an instruction to
   Claude, server-side.
4. Claude returns structured data: highlights, a correction, cards, a goal
   or next step, and then → now pairs.
5. The site renders it, and each analysis is stored.

The owner framed the voice feedback as the goal of the interaction between
the author and her students, and asked for the mini-course model to be
updated around it, with access free or paid.

Before this decision the project said the opposite in four places:

- `docs/handoff.md`, "Product thesis": "Still out of scope for both lines:
  … LLM grading."
- `docs/handoff.md`, "Item types": voice tasks "are reviewed by a person and
  never scored". docs/decisions/0109 Decision 6 says the same.
- Only an enrolled cohort learner may send a take. That is
  `submit_voice_recording` in `supabase/migrations/060_voice_submissions.sql`
  and 0110 Decision 2. On top of that, the Storage INSERT policy requires
  `has_course_entitlement` (060:115-123), so a signed-in learner on a free
  course cannot upload at all.
- `docs/release/legal/privacy-policy.md`:
  - §12: "No personal data of yours is sent to that system."
  - Lines 60 and 219: recordings are collected only in cohort courses, and
    "Practice recordings in free or anonymous lessons stay on your device and
    are never uploaded".
- `docs/release/legal/subprocessors.md:36` lists Anthropic as "Not a
  subprocessor".

## Decisions

Each one records the option the owner chose and the options put to them.

1. **The analysis reaches the learner instantly. No person approves it
   first.**
   - Rejected: "the author approves a draft" (that was the recommendation),
     and "instant on free courses, approved on paid ones".
   - This reverses "reviewed by a person" and "LLM grading out of scope", for
     voice tasks only. `free_text` stays deferred.
   - Voice stays outside the lesson score, the `{ earned, possible }`
     contract and completion. The analysis's counts are not a score.
2. **Signed-in learners only.** An anonymous visitor keeps today's
   practice-only recorder, where the audio stays on the device. Rejected:
   anonymous uploads, which have no owner for rate limits, export or
   deletion.
3. **Every course gets it:**
   - self-paced free courses;
   - self-paced paid courses, through manual `course_entitlements` grants
     (payment stays outside the app per handoff "Payments"; no checkout;
     PAY-001's "How to get access" link);
   - cohort courses.

   Cohorts keep the partner's written feedback, the review queue and the
   final comment, and the analysis runs **alongside** them. Rejected:
   replacing the cohort line; analysis on mini-courses only; analysis on paid
   courses only; "the free course gets Day 1, the final comparison is paid".
4. **Providers.**
   - Speech-to-text is **AssemblyAI**, chosen by the owner over a measurement
     spike first. The spike survives as VOICE-009, which now measures fit
     rather than choosing.
   - Analysis is **claude-sonnet-5-5**, configurable through an environment
     variable.
5. **The analysis text is entirely in English.** That covers the
   explanations, "How it sounds", the goal and the next step. Rejected:
   Russian explanations with English labels; following the EN/RU cookie,
   which would extend the toggle (0080 asks first).
6. **Limits.**
   - **Self-paced:** up to 3 analysed sends per voice task, and the latest
     counts. A hidden analysis gives its send back.
   - **Cohort:** re-sends stay unlimited until published feedback locks the
     take (today's rule, 0110). Only the first 3 sends per task get an
     analysis.
   - **Everyone:** 10 analyses per learner per day, counted in the database.
   - **Kill switch:** one global setting, `off | paused | on`. Under
     `paused`, takes still upload and the learner reads "feedback is paused".
   - Rejected: one send, then locked; unlimited sends with only a daily cap;
     a monthly money budget; one rule for cohorts too.
7. **Retention.**
   - A self-paced take's audio, transcript and analysis are deleted together,
     6 months after the take was sent.
   - Cohort takes keep "6 months after the run ends".
   - Account export and erasure include transcripts and analyses.
   - Rejected: keeping the analysis after the audio is purged.
8. **The lesson chunks are authored on the voice-task block,** as
   "Expressions to listen for", one per line as on the bench.
   - A new `after` task starts with a copy of the `before` task's list.
   - A `before` task does not show the list to the learner, so the baseline
     is honest. A final task or a weekly task shows it as "Try to use".
   - Rejected: one list per course; always hidden; always shown.
9. **What the author sees in Studio.**
   - Every analysed take on the courses she edits, read-only, **with
     audio, self-paced takes included**.
   - She can hide a wrong analysis. The learner then sees "Feedback
     withdrawn — send again".
   - Self-paced takes never enter the "waiting" queue or the inbox, so free
     traffic cannot flood them.
   - Rejected: read-only with no hide; a written note on any take; transcript
     and cards only, without audio.
10. **Two instructions, `first` and `final`, drafted for this project** from
    the screenshots and the owner's notes, because the bench's own texts
    were not supplied.
    - They are kept as versioned files, and each stored analysis records its
      instruction version and model.
    - A task with no before/after role gets `first`, without the goal card.
    - The Studio "Try the analysis" bench is a later card, not this set.
11. **The English surface is renamed Alliengll → Alina Cher**, with the
    tagline "английский с умом". This supersedes docs/decisions/0137 for the
    name.
    - The internal `lib/alliengll/*` module names stay.
    - The Telegram bot's username stays; it is external.
    - Instagram is still https://www.instagram.com/alliengll/.
    - Rejected: "Alliengll by Alina", and a header-only wordmark.
12. **A violet primary colour on the English surface only.**
    - It comes from a surface class that overrides `--brand*`. Colloquiz and
      Studio stay indigo.
    - New tokens: a highlight yellow, ink, a grid line and an offset shadow,
      each in `:root` and `.dark`.
    - Rejected: keeping indigo; violet everywhere.
13. **The redesign covers the whole learner surface:** the landing, the
    course page, the lesson chrome, the feedback view, `/my`, `/runs`, and
    the English auth panel. It is phased behind shared tokens.
    - The design source is the screenshots only. Everything below the hero,
      and every mobile layout, is designed here from the existing app.
    - Rejected: the landing only; the landing plus the feedback view.
14. **Landing content.**
    - "About me" is removed.
    - "Student reviews" is removed for now (to come later).
    - Social links: Instagram https://www.instagram.com/alliengll/ and
      YouTube https://www.youtube.com/@AlinaCherBlog.
    - Alina's photo is supplied by the owner.
    - The EN/RU toggle stays (0080). The design omits it.
    - "Start for free" keeps the one-tap rule (0070 Decision 2).
    - The comic panel ships with the landing.
    - The clickable Day 1 / Day 7 audio card ships later, with the owner's
      clips. It does not ship with dead buttons.
15. **M4, ranked 2805–2895**, between TCH-011 and the Telegram reminders.
    Rejected: inside M3 before the cohort dry run; a new milestone.
16. **Legal before go-live.**
    - AssemblyAI and Anthropic become processors of personal data, and
      self-paced recordings start being uploaded.
    - `subprocessors.md`'s change procedure requires the row and a DPA before
      a provider goes live. 0095 counts a new voice data category as
      material.
    - So the mode stays `off` in production until OPS-026's revision is
      published. OPS-027 is the go-live.

## Design notes the cards rely on

These came from a design pass over the code. They are not owner decisions, and
each card may revise them with evidence.

- **A self-paced take is a `voice_submissions` row with no enrolment.**
  - Its slot is unique on (user, lesson, block).
  - Its retention anchor is `submitted_at`.
  - Cohort retention stays derived from `course_runs.ends_at`, because a run's
    dates can move (0093).
- **A replace deletes the take row** (060, `submit_voice_recording`).
  - The per-task send count therefore lives in a ledger that outlives takes,
    not on the takes themselves.
  - Each analysis row cascades with its take, so a replace or a purge removes
    it.
- **No webhook in v1.**
  - The upload route starts the work in `after()`, the same way
    `app/api/feedback/route.ts` does.
  - A lease plus a status route re-claims a stalled step, and the daily cron
    sweeps rows stuck for longer than that.
  - VOICE-009 measures whether the worst case fits Vercel's duration limit.
- **Claude output.**
  - The call is `messages.parse` with a Zod output format, through
    `@anthropic-ai/sdk` 0.104.1, which is already installed and ships
    `helpers/zod`.
  - The instruction is the cached system block, and the transcript is passed
    as data.
  - It includes the server-side refusal fallback (`fallbacks: "default"`).
- **Model output is checked before it is shown.**
  - A highlight is kept only if it appears verbatim in the transcript.
  - Every count is computed by us, never taken from the model.
  - Everything renders as text, never HTML.

## Revisit when

- AssemblyAI does not keep disfluencies on real takes, or cannot process in the
  EU (VOICE-009). Decision 4 then goes back to the owner.
- The measured cost per analysis makes the caps in Decision 6 unaffordable at
  the free funnel's volume.
- A wrong analysis reaches a learner and the owner wants human approval back
  (Decision 1).
- OPS-025 onboards external teachers. They would then hear free-course
  recordings (Decision 9), and the privacy text must cover that.
- The partner supplies reviews or an About text (Decision 14).
