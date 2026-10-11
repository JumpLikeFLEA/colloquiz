# 0114 — VOICE-006: the review queue

Status: **in progress** (VOICE-006 ran `--no-approval`). Decisions below
are *unattended* unless marked otherwise and are open to correction. The
card stopped at its read path, which needs a schema change (see "Open").

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

## Open — the read path needs a schema change

An editor cannot read `run_enrolments` (058: owner read only), and nothing
else returns, for a course they edit:

- which run a submission belongs to (`voice_submissions` holds
  `enrolment_id`, not `run_id`);
- the run's enrolled learners, needed for "status per learner and week"
  (a learner who sent nothing has no visible row anywhere);
- an enrolment id for a learner with no submission, needed to write the
  final comment (`save_final_comment` takes the enrolment id);
- any learner label (`course_run_invites()` does not return `claimed_by`;
  email is in `auth.users`).

Proposed: migration 062 adding read-only SECURITY DEFINER RPCs gated by
`can_edit_course`. Waiting for the owner.

## What would make us revisit this

- The partner finds `**` confusing in use (0096's own trigger).
- A literal `**` round-trip bites in practice.
