# 0114 — VOICE-006: the review queue

Status: **decided unattended** (VOICE-006 ran `--no-approval`), except
Decision 2's existence and its learner label, which the owner approved on
2026-10-11. Open to correction.

## Context

VOICE-006 is where the partner listens to submissions, writes feedback and
writes COH-005's final comment, at `/studio/reviews` (0109 Decision 7).
Storage is 060 (submissions, feedback) and 061 (final comments). 0096 gives
the feedback text form and assigns the converter and its tests to this
card.

## Decision 1 — the converter is two pure modules

- `lib/feedback/markup.ts`: `feedbackFromMarkup` (textarea text →
  `FeedbackContent`, on save and for the live preview) and
  `markupFromFeedback` (the inverse, to open a saved draft or published
  feedback in the editor). Rules are 0096's; the cases 0096 names
  (unmatched `**`, `****`) have a vitest case each.
- `lib/feedback/paste.ts`: `markupFromClipboardHtml` takes an
  already-parsed root, so the module needs no DOM implementation. The
  browser passes `DOMParser`'s body; the test passes jsdom's, so the
  test stays in the `unit` (node) project (0036). Tested against the
  committed Google Docs fixture.

Additions 0096 left open:

- `**` markers never pair across a paragraph break; each paragraph is
  parsed alone.
- An empty editor converts to `null`, not to a document: FeedbackContent
  needs at least one run (060's validator refuses an empty one), so "save"
  is disabled rather than sent.
- Pasted bold keeps its surrounding whitespace outside the markers
  (`x **y** z`, not `x** y **z`), for readability in the textarea.

**Known limitation:** a run whose text holds a literal `**` pair (only
possible by typing `**` twice with nothing meant as bold) is read back as
bold when the saved text is opened and saved again. Escaping was not added:
the case needs deliberate input, and the preview shows it before saving.

## Decision 2 — the read path is two SECURITY DEFINER functions (owner, 2026-10-11)

An editor cannot read `run_enrolments` (058: owner read only), and nothing
else returned, for a course they edit:

- which run a submission belongs to (`voice_submissions` holds
  `enrolment_id`, not `run_id`);
- the run's enrolled learners, needed for "status per learner and week"
  (a learner who sent nothing had no visible row anywhere);
- an enrolment id for a learner with no submission, needed to write the
  final comment (`save_final_comment` takes the enrolment id);
- any learner label (`course_run_invites()` does not return `claimed_by`;
  email is in `auth.users`).

The card stopped here (a schema change). The owner approved migration 062
and chose **email + the invite's contact label** as the learner label,
both on privacy-policy.md:188-195's list. 062 adds `review_queue(course?,
run?, week?, status?)` and `review_final_comments(course?, run?)`: STABLE,
SECURITY DEFINER, rows only where `can_edit_course(course, auth.uid())`,
EXECUTE to `authenticated` only. Writes stay on 060's and 061's RPCs. No
table, no grant on a table, no access function changes, so
`delete_my_account` is not re-emitted.

## Decision 3 — what the queue lists (*unattended*)

- One row per **active enrolment × voice block**. A revoked enrolment
  (refund, chargeback) is left out: the learner has left the run, and
  0112 Decision 2 already refuses a final comment for them. Their takes
  stay in the table and are purged on 060's schedule.
- The blocks are every voice task in each lesson's PUBLISHED version,
  **plus** any slot that has a take but whose block has since left the
  published version, described from the version the take was recorded
  against. A re-publish must not hide a recording waiting for an answer.
  Shown on the local stack: a re-publish with the voice block removed
  still listed all 4 takes, prompts included (rolled back).
- Five statuses: `not_open` (no take, lesson opens for this run later, by
  058's per-run rule), `not_sent`, `waiting` (no feedback row), `draft`,
  `answered` (published). `not_open` exists so a week that hasn't started
  doesn't read as learners falling behind.
- Order: waiting takes oldest first (the acceptance's "oldest first"),
  then the rest by run, week, lesson, learner.
- A take removed by the 6-month purge keeps its status and is flagged
  `recording_removed`; the UI says the recording was removed instead of
  showing a player.

## Decision 4 — the page (*unattended*)

- **One call, filtered in TS.** The page calls `review_queue()` and
  `review_final_comments()` unfiltered and narrows with `lib/reviews`
  (`parseReviewFilters`, `scopeRows`, `matchesStatus`, tested). The filter
  menus and the learner × week table need more than the filtered list, and
  a queue is one cohort's rows, not a feed. The RPCs keep their filter
  parameters for the inbox (AUTH-012). Filters live in the URL, allow-listed.
- **Default status filter "To review" = waiting + draft**: every take
  without published feedback, the acceptance's queue. "Answered" is where
  feedback is edited after publishing.
- **Learner label**: the invite's name when there is one, else the email;
  the email and the invite contact are both shown under it (owner's choice,
  Decision 2).
- **Playback** is signed at render under the editor's session (0110
  Decision 5); `ReviewAudio` re-signs through VOICE-005's playback route
  once per URL on a load error. `controlsList="nodownload"` (0109 Decision
  13; it hides the browser's button, it can't stop a determined copy).
- **Final comments** are listed per enrolment, collapsed, under the queue,
  scoped by the course and run filters.
- **Links into the queue**: the course editor's Format section ("Reviews",
  pre-filtered to the course) and each run card on the runs page (course +
  run). The nav gets "Reviews"; its waiting-count badge is AUTH-012's.
- **Ctrl/⌘+B in the editor stops propagation.** The vendored `ui/sidebar`
  toggles the nav on Ctrl/⌘+B from a window keydown listener. Measured: at
  360px the first build's Ctrl+B in the editor opened the nav sheet; after
  the fix it doesn't, and Ctrl+B outside the editor still toggles the nav
  (control). `ui/**` is vendored, so the fix is in the editor.

## What would make us revisit this

- The partner finds `**` confusing in use (0096's own trigger).
- A queue grows past what one unfiltered read can render (Decision 4):
  push the filters into the RPC call.
- The partner wants to review a revoked learner's take (Decision 3).
- A literal `**` round-trip bites in practice.
