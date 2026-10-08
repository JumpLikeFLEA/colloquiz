# 0096 — VOICE-002: feedback text, storage shape and paste

Owner decision, 2026-10-08, from the options laid out on issue #146.

## Context

The partner pastes written feedback under a learner's voice recording, with
basic formatting, at least bold (partner, 2026-10-07). The same shape serves
the final-screen comment (COH-005). `InlineContent` (`lib/lessons/inline.ts`)
has no `strong` mark and no paragraphs, and widening its closed mark set is
itself a decision (0020/0022). `InlineEditor` deliberately has no range
selection, because that would need a new dependency (see its header).

## Options considered

- Storage: (A1) its own type; (A2) reuse `InlineContent` plus a `strong` mark;
  (A3) a `**bold**` string parsed at render time.
- Paste: (B1) plain text plus a Bold button; (B2) parse clipboard HTML;
  (B3) B1 now, B2 later. B1 and B3 as first written assumed range selection,
  which the lesson editor lacks, so they were replaced by Decision 2.

## Decision 1 — storage: `FeedbackContent`, its own type

`FeedbackContent` is paragraphs of runs: `{ paragraphs: { runs: { text, bold? }[] }[] }`,
stored as JSONB. It is separate from `InlineContent`, so 0020/0022's closed
mark set is untouched. COH-005's final comment uses the same type.

Rejected: A2 (feedback needs paragraphs, and a shared mark set couples the
two surfaces); A3 (parsing a string at render time is what 0018 Decision 2
excluded).

## Decision 2 — editing and paste: a `<textarea>` holding `**…**`

- Editing is a plain `<textarea>`. Bold appears as `**…**`. A Bold button and
  Ctrl+B wrap or unwrap the selection (`selectionStart`/`selectionEnd`).
- Paste: if the clipboard has `text/html`, it is converted to the same `**…**`
  text with the browser's `DOMParser`, extracting only text and bold. A run is
  bold when its effective font-weight is 600 or more: the inline style first,
  else `<b>`/`<strong>`. So Google Docs' `<b style="font-weight:normal">`
  wrapper is not bold. Paragraph breaks come from `<p>`, `<div>`, `<li>` and
  `<br>`. Without `text/html`, fall back to `text/plain`. HTML is never stored
  or rendered.
- Newlines: a blank line starts a new paragraph; a single newline is kept as a
  line break inside the paragraph (stored as `"\n"` in the run's text, rendered
  as a `<br>`).
- A live preview under the box renders the `FeedbackContent` the learner will
  see.
- No new npm dependency.

## Decision 3 — save-time conversion, render-time none

One pure function in `lib/` (vitest) converts the textarea text to
`FeedbackContent` on save, with a length cap. The renderer reads only
`FeedbackContent`, so nothing is parsed at render time (0018 Decision 2
holds). VOICE-004's write RPC validates the same shape and cap server-side;
the client check is a courtesy.

The cap is 5,000 characters, counted as the total run text after
conversion (so the `**` markers do not count). It is one named constant in
`lib/`, and VOICE-004's SQL check uses the same number (noted on that card).
Revisit if the partner hits it.

An unmatched `**` stays literal text. An empty pair (`****`) is dropped. Both
are decided, and the implementing card carries a vitest case for each.

The live preview renders the save converter's output, so it cannot differ from
what is stored.

## Trade-off accepted

The author sees `**` while editing, which AUTH-002 avoided for lesson
authoring. Accepted for feedback because paste and the button both produce the
markers, and the preview shows the result.

## Fixtures

A real Google Docs clipboard `text/html`, captured by the owner on 2026-10-08,
is committed verbatim as `lib/feedback/__fixtures__/google-docs-paste.html`.
This commit carries no converter and no test. VOICE-006 writes the converter
and tests the Docs case against this fixture, plus the unmatched-`**` and
`****` cases from Decision 3.

What the fixture shows (read from the file): bold is a `<span>` with
`font-weight:700` and normal text is a `<span>` with `font-weight:400`;
paragraphs are `<p>`, followed by a trailing `<br />`; there is a
`<!--StartFragment-->` marker and a stray `<meta>`. It contains no `<b>`
wrapper at all, so the card's claim of a `<b style="font-weight:normal">`
wrapper is not observed in this sample (it may appear for other copy
selections). The rule in Decision 2 (effective font-weight of 600 or more,
inline style first) handles both shapes. A sample from wherever else the
partner writes feedback is still wanted if that is not Docs.

## What would make us revisit it

- A real Docs or other clipboard sample that the font-weight rule misreads.
- The partner finding `**` confusing in use.
- A need for a second mark (italic, links) in feedback.
