# 0136 — PAY-001: a gated lesson tells the learner how to get in

## Context
A self-paced paid lesson showed "This lesson opens when you buy the course." and
"Back to course" only (0079 D8), and its course-page row carried no cue
(`LessonListItem` marked only the free ones). Paid access for cohorts moved
outside the app (docs/handoff.md, "Payments"), so there is no checkout to link.

## Decisions
1. **Reuse `courses.how_to_join_url`** (058; `^https://\S+$` CHECK, set by
   `set_course_how_to_join_url`, which does not look at `format`). No schema
   change, no migration. `readPublicLesson` selects it and the
   `needs_entitlement` state carries it as `howToJoinUrl`.
2. **Paid card**: with a link, "How to get access" is the primary action
   (`SUBMIT_BUTTON_CLASS`, plain `<a>`, new tab, `noopener noreferrer`); without
   one the card is as before. The Studio "Visitor view" renders the same
   component, so it shows it too. Strings in `signInCopy.ts` (`paidCopy`), a
   server-only module, not `copy.ts` (0104 precedent).
3. **Studio**: the "How to join (link)" input was inside the cohort-only block,
   so a self-paced author could not set it. It now shows for both formats, with a
   hint per format. Runs/calls/reviews stay cohort-only.
4. **Course-page cue**: a row whose `course_lesson_states` state is
   `needs_sign_in` or `needs_entitlement` gets a muted pill ("Sign in to open" /
   "Paid", EN/RU in `courseCopy.ts`). It reads the SQL state, never
   `accessLevel`, so a granted learner (state `open`) sees no pill. An all-free
   course has no such state, so its page is unchanged. `scheduled` keeps its own
   "Opens <date>" pill.

## Revisit if
Self-serve checkout lands (then the primary action becomes the buy flow), or the
partner wants a separate link for self-paced courses.

## Verification
`npm run check`, `npm test` (1241 pass); `npm run budget`: course page 172.9 KB of
182, identical before and after (stash comparison). Pre-existing, unchanged by
this card: `/courses/future-imperfect/true-or-false` 261.8 of 260, `/runs/…` 404
and `/my` sign-in FAIL (no seeded data locally). Not exercised in a browser: no
paid lesson exists in the local data, so the paid card and pills are covered by
component tests only.
