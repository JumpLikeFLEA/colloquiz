# 0115 — COH-005: the before/after screen

Status: **decided unattended** (COH-005 ran `--no-approval`). Each decision
fills a gap the card, 0100, 0110 or 0112 leaves open. None changes a rule
they state. No migration: every read the screen needs already has an RLS
path (058, 060, 061). The protocol output is in #163's closing comment
(local stack).

## Context

A cohort course records the same voice prompt at the start (`compare:
"before"`) and at the end (`compare: "after"`) of a run (0100 Decision 1).
At the end, the partner writes a final comment per enrolment (061, written
in Studio's review queue, 0114). This card shows the learner both takes
side by side, with the comment.

## Decision 1 — the route is `/runs/[runId]`, top-level

The screen belongs to a run, not just a course: a learner in a repeat run
has one enrolment, one pair of takes and one comment per run (0112
Decision 1). The run id is in the URL.

`/courses/[courseSlug]/<segment>/...` was rejected. A static segment there
(`final`, `results`) would also catch a lesson slugged the same way. That
lesson's page would keep working, but its `opengraph-image` route
(`/courses/x/final/opengraph-image`) would hit the new route instead.
Lesson slugs are transliterated titles (CNT-010), so a lesson called
"Final" is plausible. No top-level English path starts with `/runs`.

`proxy.ts` only gates `/app` and `/studio`, so the route is reachable
signed out. It renders the band and a sign-in card whose `next` points back
here (ANON-016). Chrome is English with no toggle, per the card.
`pageLangForPath` maps `/runs/<id>` to `en`, so `<html lang>` and the footer
follow (SHELL-018's rule).

## Decision 2 — who sees the screen: the learner's own non-revoked enrolment

- **Signed out:** sign-in card.
- **Signed in, enrolled in the run:** the screen.
- **Not enrolled, revoked, unknown or malformed id:** 404, with no hint
  that the run has a screen.
- **An editor who is not enrolled:** 404. Editors read the same rows in
  Studio (0114); a learner-shaped page for an editor would be a second
  review surface, and nothing asked for one.

A revoked enrolment gets a 404, consistent with the course page (no
`BeforeAfterLinks`) and the review queue (revoked enrolments left out,
0114 D3). Revocation means a refund (docs/handoff.md, "Payments"). The
data itself is untouched: 061's owner policy still returns a comment
published before revocation, and the account export carries it (0112
Decision 2). Only this page is closed.

**Revisit** if the partner wants a refunded learner to keep the screen.

## Decision 3 — where a slot lives: the readable published documents

The slot is read from the published document, as 0100 Decision 3 and 0110
("Not in this card") left it: submissions are keyed by (enrolment, lesson,
block), not by slot. `lib/voice/beforeAfter.ts` (pure, tested) works like
this:

- it scans the published documents the learner can read now. Through
  `lesson_versions`' "published content read" policy (058), that means
  `can_read_lesson`, so a later week that hasn't opened has no readable
  document;
- for each slot, it takes the earliest lesson by ordinal, then the first
  block. Publish refuses a second block per slot, but only in a route (0100
  Decision 3), so a direct RPC call could leave two. Archived lessons
  still locate a slot (0100 D3 counts them too) but aren't linked;
- it matches the learner's take for this enrolment by (lesson, block).

That gives four slot states:

| state | meaning | render |
|---|---|---|
| `recorded` | a take with its object | player (`SignedAudio`) |
| `removed` | a take the 6-month purge emptied (`object_name` NULL, 060) | "This recording was removed after the course ended. You did record it." |
| `missing` | the slot's lesson is readable, nothing sent | "You haven't sent a recording for this task yet. Record it in <lesson>." |
| `unknown` | no readable lesson holds the slot | before: "This task isn't open yet."; after: "This task opens near the end of the course." |

`removed` is decided from the row, never from the absence of audio. That
is the card's line: a learner who returns after the purge is not told they
never recorded.

`unknown` is not called "missing" on purpose. Before week 4 opens, the
"after" lesson's document is invisible, so the screen cannot know which
lesson holds the slot. It says the task opens later rather than guessing.
The `unknown` text for "before" covers a course with no slot authored, as
well as a "before" in a week not yet open.

The prompt shown above the pair is the "before" block's, else the
"after" block's. It is the same prompt by design (docs/handoff.md, "Two
product lines").

## Decision 4 — the comment: published or pending, nothing in between

The learner's read is 061's "owner reads published", and the loader adds
`published_at IS NOT NULL` itself (0112 Decision 3's reason: an editor
enrolled in their own course would otherwise read a draft). A draft is
therefore "pending": "Your teacher's final comment isn't ready yet. It
appears here once it's published." A body that doesn't parse as
FeedbackContent is logged and shown as pending, never rendered raw
(taskContext.ts precedent). It renders through the same
`FeedbackContentView` box as weekly feedback.

## Decision 5 — the player is shared, not copied

Studio's `ReviewAudio` (0114) moved to
`app/components/voice/SignedAudio.tsx`, used by both. It holds the
expired-URL recovery: sign a fresh URL through
`/api/voice/submissions/<id>/playback` once per URL. Studio code must not
reach an English route (0109), and a copy would let the two recoveries
drift. The playback route already serves the learner: it signs under the
caller's session.

## Decision 6 — the entry point is the course page, from enrolment

An enrolled learner (basic or extended, non-revoked) sees one
`BeforeAfterLinks` row per run under the cohort block on
`/courses/[courseSlug]`, in the calls card's shape, with EN/RU strings in
`courseCopy.ts`. It shows from day one, not only after the run ends: the
screen itself says what is missing, and the "before" link is useful in
week 1. Measured: the course page signed in is 172.0 KB, its budget is
182 KB, and the row adds no client JS (a Server Component with
`next/link`). PROG-002's learner home will link here too.

## Budget

Run on the local stack with `scripts/seed-local-fixtures.ts`'s new cohort
fixture: a third course, `coh005-fixture`, whose run has the fixed id
`c0050000-0000-4000-8000-00000000f1a0`. `npm run budget` measured
`/runs/<that id>` (signed out) at **176.3 KB**. A signed-in learner with a
player on the page, measured the same way (fresh context, CDP script
bytes, cookies only carried over), was also **176.3 KB**. `SignedAudio` is
a static import, so the route ships it in both states. budgetKB is
**184** (+~4.5%, the 0057 precedent).

## What would make us revisit this

- A refunded learner should keep the screen (Decision 2).
- The partner wants to see a learner's screen as the learner sees it
  (Decision 2: editors get a 404 today).
- Two blocks per slot turn up in data. At that point, move the uniqueness
  into SQL as 0100 Decision 3 describes.
- PROG-002 wants the screen under `/my`.
