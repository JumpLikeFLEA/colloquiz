# 0224 — Line breaks in a voice task's prompt

## Context
The author wrote one voice task with two situations ("Situation 1. … Situation 2.
… Record both answers in one go.") and could not separate them. The prompt is
`InlineContent`: runs of text with marks (lib/lessons/inline.ts). Every run's
text is single-line (`authoredString()`, which refuses every C0 control
character, `\n` included). The editor draws each run as an `<input>`, and the
lesson draws every run inline in one `<p>`, so the two situations ran together
(owner's screenshots, 2026-11-09).

## Options
- **A. Allow `\n` inside a run's text, for the voice prompt only.** The
  validator is the existing `authoredString(1, { allowNewlines: true })`:
  CR/CRLF are stored as LF, and tabs and other control characters are still
  refused. The stored shape and the TypeScript type do not change. SQL passes
  `block->'prompt'` through as JSONB (062, 064, 073), and every plain-text reader
  joins the run texts (`inlinePlainText`), so no migration is needed and every
  existing document stays valid.
- **B. A line-break run, or a `break` flag on `InlineRun`.** This widens the run
  type shared by every theory field. 0020 and 0022 say that widening it is a
  decision, and every renderer of every field would then have to handle it.
- **C. The prompt as an array of paragraphs.** This changes the stored shape.
  Readers that parse the prompt (the review queue, the learner page, the
  before/after screen, the ask-the-teacher snapshot) would need a union or a
  data migration.

## Decision
1. **A.** `MultilineInlineContentSchema` (lib/lessons/inline.ts) is
   `InlineContentSchema` with `allowNewlines` on each run's text. Only
   `VoiceTaskBlockSchema.prompt` uses it. Theory text, captions and the
   self-check prompt stay single-line.
2. **Reading.** Any code that parses a voice prompt by itself uses the
   multiline schema: `/studio/reviews` and `/studio/learners/[userId]`.
   With the single-line schema, a multi-line prompt fails to parse and the card
   shows no prompt, with no error. Readers that parse through
   `VoiceTaskBlockSchema` or `parseLessonDocument` need nothing new.
3. **Drawing.** A voice prompt is drawn with `whitespace-pre-line` in three
   places: the lesson's voice card (which also covers the Studio preview and the
   demo), the before/after screen and the ask-the-teacher attachment card. The
   Studio review and learner cards already had it. One Enter is a line break and
   two make a blank line. The author chooses, and no paragraph spacing is added.
4. **Editing.** `InlineEditor` takes `multiline`: each run is a textarea that
   grows with its text (`field-sizing-content`, with `rows` as the fallback), so
   Enter starts a new line. A hint under the field says so. Only the voice
   form sets it.

## Measured
See the 2026-11-09 entry in `docs/ui-decisions.md`.

## Revisit if
- The author wants line breaks in theory text or the self-check prompt. That
  means widening those fields too, with the same check of every reader.
- A voice prompt reaches a place that cannot honour `\n`, such as a Telegram
  message or a generated document. That place needs its own rendering of the
  break.
