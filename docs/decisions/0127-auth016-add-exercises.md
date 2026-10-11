# 0127 — AUTH-016: adding exercises from the lesson editor

Status: decided unattended while working AUTH-016 (`--no-approval`), inside
0125 Decisions 5 and 6. The menu labels, the empty-template rule and the
"Show as" Select come from 0125; this file records what the card left open.

## Decision 1: the templates live in `lib/studio/exerciseTemplates.ts`

`EXERCISE_VARIANTS`, `EXERCISE_VARIANT_LABEL`, `exerciseTemplate(variant,
newId?)` and `exerciseLabel(item)`. The id generator is a parameter so the
tests can use predictable ids. `exerciseTemplate` returns a whole
`LessonPracticeBlock`, with the block id equal to the item id, because
`parseLessonDocument` reads the block id from the item envelope.

## Decision 2: what an empty template contains

Each template has the smallest structure its form can show. Every text
field is empty, so `parseItem` fails until the author fills it in.

| Variant | Starts with |
|---|---|
| Multiple choice | 2 empty options, no correct option |
| True / False | options "True", "False", no correct option |
| True/False statements | 1 empty row, marked true |
| Put in order | 2 empty elements |
| Match pairs / Sort into groups | 2 left and 2 right, paired 1–1 |
| Fill the gaps / Drag words into gaps | 1 gap with one empty answer |

- "Sort into groups" needs at least two right elements to parse
  (`matching.ts`, the `presentation "sort"` check). "Match pairs" gets the
  same 2 × 2 so the two variants differ only in `presentation`.
- Selection's `explanationRef` is the item's own id. The form never shows
  it.
- Measured: `exerciseTemplates.test.ts` pins the exact error fields of each
  empty template. Every field is one the form renders an error list for:
  `payload.prompt`, the per-part text fields, `payload.options`,
  `payload.correctOptionIds` and `payload.explanations`.

## Decision 3: row labels come from content, not from the menu

A block row's label is `exerciseLabel(item)`. It is read from the item, so
an imported exercise gets the same label as one added from the menu. Nothing
extra is stored.

- A selection is "True / False" only while it is single-answer and its
  options are exactly "True" and "False". Once the author edits them, it is
  labelled "Multiple choice", because that is what it has become.
- Matching follows `presentation`, and slots follows `input`.
- Storing the chosen variant on the block was rejected. It would add a
  field to the lesson document, and the importer and the export shape would
  have to carry it.

The row preview, which used to read "`<type>` item", now shows the
exercise's prompt, or "(empty)".

## Decision 4: a gap-marker hint on the slots form

The slots form gets one muted line under the prompt: "Write ___ (three
underscores) in the prompt where each gap goes". This is the convention the
player splits on (`splitPromptOnGaps`, `lib/lessonPlayer/slotsResponse.ts`,
0031). Until now only imported lessons used slots, and nothing in the UI
told an author about it. `parseItem` does not check the marker count, so
this is guidance, not validation.

## Decision 5: the "Show as" Select explains "sort" in one line

With "Sort into groups" selected, a muted line under the Select says that
the left side holds the statements and the right side the groups. The
Left/Right labels are unchanged.

## Not done here (proposed as cards)

- **Error messages are engine messages.** An empty exercise shows "Too
  small: expected string to have >=1 characters" and "explanationRef(s)
  resolve to no explanation … <uuid>". They appear in the right place, but
  the partner will not understand them. Before this card the same messages
  came from imported items. They now reach anyone who adds an exercise.
- **The lesson editor header overflows at 360px.** The Preview, History and
  Save buttons are `shrink-0` beside the title, so at 360px Save sits
  off-screen in a horizontally scrolling container (screenshot from the
  AUTH-016 check). This card did not change the header.

## What would make us revisit this

- The partner finds a variant label confusing, or wants a variant the
  menu lacks, such as multi-answer multiple choice. Today that is a switch
  inside the "Multiple choice" form.
- An editor needs to tell a True / False item apart from a multiple-choice
  item that happens to have the options True and False. That would mean
  storing the variant (Decision 3).
