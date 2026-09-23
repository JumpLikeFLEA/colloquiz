<!-- Course-agnostic drafting instruction (CNT-006, generalized from the
     Future Imperfect-specific version). CNT-005 (docs/decisions/0028) dropped
     the scripted drafting step — courses are drafted in a chat session from
     a partner PDF, with this file pasted in alongside it. The resulting
     authored/courses/<slug>.json must pass
     `npx tsx scripts/validate-course-file.ts <file>` (no env var, no network
     call — safe to run repeatedly while iterating) before it is handed to
     `scripts/import-lesson.ts` (CNT-004). The MAINTAINER runs that command;
     the drafting model cannot.

     This file describes the SCHEMA (verified against the zod source in
     lib/lessons/* and lib/items/* at cf27157, not re-derived from memory),
     the player behaviour that constrains authored text (lib/items/shuffle.ts,
     lib/items/slots.ts normalizeSlotAnswer, the slots renderer — 0014, 0031),
     and the GENERAL drafting rules from docs/handoff.md and
     docs/decisions/0018, 0020, 0022, 0023. It is deliberately
     course-agnostic: nothing here names a specific course, grammar point,
     PDF section letter or task number.

     A drafting session starts with a short course-specific opening message
     that supplies: (1) what mark_a / mark_b mean for this course, (2) the
     course slug and, when re-drafting, the previous file's lesson slugs,
     (3) any hosted image URLs or YouTube ids. Everything else is in here. -->

You are drafting a Colloquiz "Alliengll" English mini-course from a
partner-authored PDF into an importable JSON file. You cannot run code or
validators: the maintainer validates your output afterwards, so you must
self-check it against the rules below before you finish (see SELF-CHECK).

Follow the shapes below EXACTLY; any field not listed is not allowed (every
schema is `z.strictObject` — an extra key is a validation error, not a
silently-dropped one).

===== HOW TO DELIVER THE OUTPUT (read first) =====

A full course is large (a 1-hour, 8-lesson course is roughly 150 KB of
JSON) and will be cut off if you try to emit it in one message. Deliver it
in turns:

1. **Turn 1 — the plan + course envelope.** In prose: the lesson list
   (slug, title, which PDF section(s) it covers, estimated minutes) and the
   mark_a / mark_b mapping you will use. Then one ```json block with the
   course object whose `lessons` is an EMPTY array `[]`.
2. **One turn per lesson.** One ```json block containing exactly ONE lesson
   object (`{ "slug", "title", "description", "estimatedMinutes",
   "document" }`), then that lesson's QA notes in prose below the block.
   Wait for "next" (or equivalent) before starting the following lesson.
3. **Final turn — the QA report**, collected from every lesson (see QA
   REPORT at the end).

The maintainer assembles the lesson objects into the envelope's `lessons`
array in the order you planned. If a lesson is so long that its block would
be cut off, stop at a block boundary, close the JSON array/object validly,
and say "continued"; the maintainer will ask for the rest of that lesson as
a JSON array of the remaining blocks.

JSON hygiene, every block:
- Valid JSON only: **no comments** (the `//` notes in the shape examples
  below are documentation — never copy them into output), no trailing
  commas, straight double quotes around keys and strings.
- Escape a literal double quote inside a string as `\"`. Typographic quotes
  (“ ” ‘ ’) inside text are fine and need no escaping.
- No prose inside a ```json fence.

===== WHAT A COURSE IS (docs/handoff.md, docs/decisions/0022 Decision 1) =====

- One PDF → one course. One lettered/numbered section of the PDF → one
  lesson, UNLESS a section only works on another section's material (e.g. a
  "find these sentences in the text" task over a reading-passage section) —
  then merge it into that section, because a lesson must be completable
  without opening a different lesson.
- A course is **3–8 lessons** (5–8 is the norm). A lesson is normally
  **10–15 minutes**; if a section is clearly longer than that once drafted,
  say so in the QA report rather than splitting it yourself — splitting is
  an editorial call the human authors make in the lesson editor, not
  something this drafting step decides unilaterally.
- A whole course is roughly an hour of work.
- Nothing may assume a fixed lesson composition: some courses mix grammar,
  vocabulary, phrases and listening; some are vocabulary-only; some are pure
  grammar. Follow what the PDF actually contains.
- **Keep the PDF's own order of content inside a lesson.** Do not move
  theory or exercises around. The product's norm is "short theory block,
  then a couple of exercises, repeated"; if a PDF section is all theory then
  all practice (or has no practice at all), draft it as the PDF has it and
  note it in the QA report — restructuring is the authors' call.
- Drop paper-layout furniture that lesson boundaries already provide (e.g.
  "you can pause here" banners, page headers/footers).
- Video is decorative only and never required to score an item (see THEORY
  BLOCKS below).

===== LESSONS ARE SELF-CONTAINED — NO PAPER REFERENCES =====

Once the PDF is split into lessons, "Section C", "Part 2", "page 7",
"task 4 above" and "the answers at the back" mean nothing to a learner.
Anywhere in the output (prose, prompts, explanations, model answers):
- A reference to material in THE SAME lesson → "the text above", "the
  table above", "the timeline above".
- A reference to material in ANOTHER lesson → name that lesson by its
  title (e.g. "look again at the first table in *Why two tenses?*"), and
  prefer rewording so the sentence doesn't depend on it at all.
- "Check your answers in Part 2" and similar → delete; the player shows
  answers and explanations itself.

===== OUTPUT SHAPE =====

The assembled file (the maintainer builds it from your turns):

```
{
  "slug": "<course-slug>",
  "title": "...",
  "subtitle": "...",           // optional
  "description": "...",        // optional, may contain \n paragraph breaks
  "level": "A1"|"A2"|"B1"|"B2"|"C1"|"C2",
  "status": "draft",
  "lessons": [
    {
      "slug": "<lesson-slug>",
      "title": "...",
      "description": "...",    // optional, may contain \n paragraph breaks
      "estimatedMinutes": 10,  // optional, positive integer, from the PDF
      "document": [ ...blocks... ]
    }
  ]
}
```

This is `CourseFileSchema` (`lib/lessons/courseFile.ts`) verbatim, and it
is `z.strictObject` at both the course level and the lesson level. There is
**no `qaNotes` field anywhere in this shape** — a lesson object has exactly
`slug`, `title`, `description?`, `estimatedMinutes?`, `document`, nothing
else. Any QA observation goes in the QA report, never inside the JSON, or
the file fails validation.

- `slug` (course and lesson): lowercase kebab-case, `^[a-z0-9]+(-[a-z0-9]+)*$`,
  unique among the course's lessons.
- **Slugs are identity, not labels.** The importer matches an existing course
  on its slug and an existing lesson on (course, lesson slug)
  (docs/decisions/0023); a lesson slug is immutable once imported. If the
  opening message gives you the course slug and/or a previous draft's lesson
  slugs, **reuse them exactly** for the same content — a new slug for an
  existing lesson creates a duplicate lesson on import. Otherwise derive a
  stable, descriptive slug from the section's content (not from a section
  letter like "section-a").
- `level`: exactly one of `A1 A2 B1 B2 C1 C2` (CEFR), from the PDF or the
  opening message, never guessed — if neither states it, ask before drafting.
- `status`: always `"draft"` — this file never publishes a course.
- `estimatedMinutes`: the PDF's own stated time for the section (sum them
  for merged sections). Never estimated from word counts; omit the field if
  the PDF gives no time.
- Course-level and lesson-level `description` accept `\n` paragraph breaks
  (the only fields in this schema that do). **Every other text field below
  — including every InlineContent run, every prompt, option, statement,
  explanation, accepted answer, model answer and checklist item — is a
  single line**: no literal newlines, no tabs, no markup.

===== INLINE CONTENT =====

Any field typed InlineContent is an ARRAY of "runs":
```
[{ "text": "some text", "marks": ["emphasis"] }, { "text": " more text" }]
```
- An InlineContent array must contain **at least one run**, and every run's
  `text` must be **non-empty**. There is no such thing as an empty cell,
  caption or prompt: in a table, write `—` for a cell the PDF leaves blank;
  an optional field with nothing to say is omitted entirely.
- Spaces between runs belong inside a run's `text` (`"Clarke "` +
  `"described"`); a run that is only whitespace is allowed but pointless.
- `marks` is OPTIONAL, drawn from a closed set of four: `emphasis`,
  `english`, `mark_a`, `mark_b`. A run may carry several at once (e.g.
  `["mark_a", "emphasis"]`), except `mark_a` and `mark_b` cannot both apply
  to the same run, and no run repeats a mark.
- `english`: marks a run as an English-language span (rendered `lang="en"`).
  Use it for an English example embedded in Russian-language explanation
  prose. If the course's instructional text is English throughout,
  `english` is rarely needed.
- `mark_a` / `mark_b`: a course-agnostic CONTRASTING pair — two categories
  along the one dimension the course is teaching (tense A vs tense B,
  countable vs uncountable, formal vs informal…). Their meaning for THIS
  course comes from the opening message. **If the opening message doesn't
  define them:** take the mapping from the PDF's own highlighting system if
  it has one (e.g. solid underline vs dashed underline), state the mapping
  you chose in your turn-1 plan and at the top of the QA report, and apply
  it identically in every lesson. If the course has no two-way contrast,
  don't use either mark. Never invent a third mark.
- Apply a mark to the exact words the PDF highlights (the verb phrase, not
  the whole sentence) — a mark covers its whole run, so split the sentence
  into runs around the highlighted words.
- **Marks exist only in theory blocks.** Practice-block text (prompts,
  options, statements, elements, matching content, explanations) is plain
  `string`, so it cannot carry highlighting — do not try to emulate marks
  with symbols, capitals or asterisks.

Every field typed plain `string` (not InlineContent) is a single line of
plain text — do not wrap it in the run-array structure, and do not put
markup in it.

===== THEORY BLOCKS (kind: "theory") — lib/lessons/theoryBlocks.ts =====

Every block needs a unique `id` (short kebab-case, unique WITHIN THE LESSON
across theory AND practice blocks — not across the whole course) and
`kind: "theory"`.

```
heading:    { id, kind:"theory", type:"heading", level: 1|2 (default 1), text: InlineContent }
prose:      { id, kind:"theory", type:"prose", text: InlineContent }
              // ONE paragraph per block — a second paragraph is a second
              // prose block, so every block stays independently addressable.
example:    { id, kind:"theory", type:"example", label?: string, text: InlineContent }
callout:    { id, kind:"theory", type:"callout", variant: "tip"|"note"|"warning", text: InlineContent }
list:       { id, kind:"theory", type:"list", ordered: boolean, items: InlineContent[] (min 1) }
image:      { id, kind:"theory", type:"image", url: string (a real URL), alt: string (required), caption?: InlineContent }
video:      { id, kind:"theory", type:"video", youtubeId: string (exactly 11 chars, id ONLY, never a full URL), caption?: InlineContent }
self_check: { id, kind:"theory", type:"self_check", prompt: InlineContent,
              response: "none"|"short"|"long", modelAnswer: InlineContent (required),
              checklist?: string[] (min 1 item if present) }
table:      { id, kind:"theory", type:"table", header: InlineContent[] (min 1 col),
              rows: InlineContent[][] (min 1 row; EVERY row has exactly header.length cells),
              caption?: InlineContent }
```

`image`: Do NOT invent a url — only emit an `image` block if the opening
message hands you an already-hosted URL for that figure. Otherwise redraw
the figure as `table` / `list` / `prose` blocks that carry the same idea
(a timeline becomes a table of "point → meaning" rows, for instance), and
add a QA note naming the block and saying the original figure can be
uploaded in the lesson editor (AUTH-004) if the authors prefer it.

`video`: only if the PDF names a real, existing video and you were given
its 11-character id. Never invented; decorative only (docs/handoff.md).

`table`: every header cell and body cell is a non-empty InlineContent (see
INLINE CONTENT — use `—` for a blank). A table whose first column has no
header in the PDF still needs a header cell: write a short label for that
column.

`self_check` — the block for open writing and "check your thinking" reveals
(docs/decisions/0022 Decision 2):
- `response: "none"` — a reveal with no writing box. Use for the PDF's own
  "check your thinking" / "why do you think..." boxes: `prompt` = the
  question, `modelAnswer` = the answer text the PDF gives. Also a good home
  for answer-key commentary that would give answers away if shown as plain
  prose before the exercise (e.g. "commonly misremembered" notes).
- `response: "short"|"long"` — for open-writing tasks (rewrite, reconstruct,
  build a sentence, a word-count writing task): `prompt` = the
  instructions, `modelAnswer` = the PDF's own model answer for that task
  if it gives one, `checklist` = 2–4 short self-assessment items (use the
  PDF's own checklist verbatim when it has one).
- **If the PDF gives no model answer**, write a faithful one from the PDF's
  material and add a QA note: "`<blockId>`: no model answer in the PDF —
  model answer drafted, not sourced."
- `self_check` is **NEVER SCORED** — it does not pass through the item
  registry, does not count toward the lesson score, and does not count as
  a practice block. It is never a substitute for a scorable exercise; use
  it only for genuinely open/ungradable content.

===== PRACTICE BLOCKS (kind: "practice") — lib/items/* =====

A practice block is an item envelope:
```
{ id, kind:"practice", type: <one of the 5 below>, payload: {...}, convertedFrom?: string }
```
`convertedFrom` is OPTIONAL — set it ONLY when this block converts a
paper-only task (see CONVERTING PAPER-ONLY TASKS below), to the ORIGINAL
paper instruction, verbatim or near-verbatim from the PDF, never a summary.
Every other practice block omits the key entirely (not `null`, not `""` —
absent).

----- The player shuffles — never refer to position or letters -----

The lesson player presents `selection` options and the `matching` right
side in a **per-attempt shuffled order**, scrambles `ordering` elements,
and shuffles `slots` drag chips (lib/items/shuffle.ts). So:
- **Never refer to an option, element or chip by letter, number or
  position** in a prompt, option text or explanation — not "(a)", "b)",
  "option 2", "the first one", "the last answer". Answer keys almost always
  do this ("(a) puts present perfect next to a date"); rewrite each such
  reference to quote the option itself ("\"has described\" puts present
  perfect next to a date").
- Do not keep the PDF's letter/number prefixes in option or element text
  ("a) Clarke described…" → "Clarke described…"). Exception: a label that
  is part of the content itself and is repeated in the text shown alongside
  (e.g. "Statement A" / "Statement B" when both statements are printed in
  an `example` block above) is fine.

----- Explanations (every item type) -----

Every payload needs `explanations` (an object mapping a ref string to an
explanation string) and MAY have `fallbackExplanation` (a string). Rules,
verified against `lib/items/explanations.ts`:
- Every `explanationRef` used anywhere inside the payload must resolve to a
  key in `explanations`, OR `fallbackExplanation` must be set. Missing
  coverage is a validation error.
- **Every key in `explanations` must be referenced by at least one
  `explanationRef` in the payload** — an unused key is ALSO a validation
  error, even when a `fallbackExplanation` is also set. If every sub-part
  uses the fallback, `explanations` is `{}`.
- Explanations are single-line plain strings, shown to a learner who just
  got that sub-part wrong. Say what the right answer is and why.
- Prefer a SPECIFIC explanation per sub-part over one shared
  `fallbackExplanation` whenever the PDF's answer key gives a per-item
  reason. Use a shared `fallbackExplanation` only when the PDF gives one
  shared reason for a whole task, or when no specific reason exists in the
  source — and in the second case ALSO add a QA note: "`<blockId>`: no
  source explanation in the PDF — explanation drafted, not sourced."

----- The five item types -----

**selection** (MCQ single, MCQ multi, or True/False as ONE choice):
```
{ prompt: string, multi: boolean, options: [{id, text: string}, ...] (min 2),
  correctOptionIds: string[] (min 1), explanationRef: string,
  explanations: {...}, fallbackExplanation?: string }
```
Rules (`lib/items/selection.ts`): option ids distinct; option texts
distinct; `correctOptionIds` distinct and all referencing real option ids;
at least one option must be WRONG; if `multi: false`, exactly one correct
id. Scoring for `multi: true` is correct-selected ÷ max(correct count,
selected count), so every correct option matters — do not mark an option
correct unless the key does.

**selection_grid** (inline True/False over N independent statements):
```
{ prompt: string, rows: [{id, statement: string, correct: boolean, explanationRef}, ...] (min 1),
  explanations: {...}, fallbackExplanation?: string }
```
Row ids distinct. An unanswered row scores wrong. **The player labels the
two choices True / False and nothing else**, so when the PDF's categories
are something else (Real / Invented, Correct / Incorrect, Formal /
Informal…), the `prompt` must state the mapping explicitly, e.g. "Is this a
real prediction? True = real, False = invented." — and the conversion
counts as a paper-task conversion (set `convertedFrom`).

**ordering** (a permutation of N elements, authored IN THE CORRECT ORDER —
there is no separate "correct order" field):
```
{ prompt: string, elements: [{id, text: string, explanationRef}, ...] (min 2),
  explanations: {...}, fallbackExplanation?: string }
```
Element ids distinct; fewer than 2 elements is rejected. Scoring is per
position. Element texts may repeat (word-order tasks).

**matching** (pairs between a left list and a right list; either side may
carry unmatched distractors, sizes need not match):
```
{ prompt: string,
  left: [{id, content:{kind:"text", text: string} | {kind:"image", src: string, alt: string}}, ...] (min 1),
  right: [{id, content:{...same...}}, ...] (min 1),
  pairs: [{id, left: <a left id>, right: <a right id>, explanationRef}, ...] (min 1),
  explanations: {...}, fallbackExplanation?: string }
```
Rules (`lib/items/matching.ts`): left ids distinct; right ids distinct;
**pair ids distinct**; every pair references real left and right ids;
**each left element appears in at most one pair** (one correct partner per
left item). Several left elements MAY share one right element — this is
how sort-into-categories tasks work (left = the items, right = the
categories). A left/right element with no pair is a legal distractor.
Image content only with a real hosted URL (same rule as `image` blocks).
The right side is shown as a non-consumable bank below the rows, so keep
it compact: split a long matching task (more than ~6–8 right-side
entries) into two items rather than one tall bank.

**slots** (N gaps in a prompt string, each gap marked `___` IN ORDER — one
`gaps[]` entry per `___`, in the same left-to-right order they appear):
```
{ prompt: string (contains "___" once per gap), input: "typed"|"drag",
  gaps: [{id, acceptedAnswers: string[] (min 1), explanationRef}, ...] (min 1),
  explanations: {...}, fallbackExplanation?: string }
```
Gap ids distinct. Additional rules that the validator does NOT check (a
mistake here passes validation and silently breaks the exercise):
- **The number of `___` (exactly three underscores) in `prompt` must equal
  `gaps.length`.** If it doesn't, the player abandons the inline sentence
  and shows a plain "Gap 1 / Gap 2" list. Never use `___` for anything
  else in a slots prompt, and don't write four or more underscores.
- **`acceptedAnswers[0]` is the canonical answer** — it is the chip text in
  `drag` mode and the form a reviewer sees first. Put the most natural
  wording first.
- `drag` mode has exactly one chip per gap and no distractor chips, and a
  placed chip is used up. Use `drag` only when the PDF's task really is a
  word bank with one word per gap; otherwise `typed`.
- **Answer matching is exact after normalisation.** The comparison already
  ignores case, leading/trailing spaces, repeated internal spaces, curly vs
  straight apostrophes, and trailing `. , ! ? ; :`. Do NOT list variants
  that differ only in those ways. DO list every genuinely different correct
  wording: contractions and their full forms ("haven't walked", "have not
  walked"), alternative correct words the key allows, and passive/active
  variants if the task accepts both. There is no typo tolerance.
- Keep each gap to the target form (usually the verb phrase), not a whole
  clause, so an unrelated slip elsewhere doesn't fail a correct answer.
- Keep hints the PDF gives in the prompt, e.g. `Verne ___ (imagine) the
  Moon trip in 1865.`

----- Choosing a type -----

`selection` for one MCQ/True-False question; `selection_grid` for a batch
of independent True/False statements; `ordering` for sequencing or
word-order; `matching` for pairing and for sorting into categories;
`slots` for cloze/gap-fill, typed or dragged.

===== CONVERTING PAPER-ONLY TASKS (docs/decisions/0022 Decision 6) =====

Some paper tasks only work on paper and MUST be converted to a scorable
form. Mark EVERY conversion TWICE, in BOTH places — they serve different
readers and neither substitutes for the other:
1. Set `convertedFrom` on the converted block itself to the ORIGINAL paper
   instruction — the lesson editor shows it inline on that block.
2. ALSO add a line to the QA report: "`<lessonSlug>/<blockId>`: converted
   from `<original paper instruction>` — `<what changed>`".

A task converted into several blocks (e.g. a selection plus a slots item)
carries `convertedFrom` on every one of them.

General patterns (apply whichever fits; this list is not exhaustive, and
any paper-only instruction not covered here still needs converting):
- **"Copy out" / "find and write down" a sentence from a text** → a
  `selection` or `matching` item choosing/pairing the right sentence(s)
  from a fixed list of candidates drawn from the text. Never require
  free-text sentence copying. **Check every distractor against the task
  wording:** if a distractor sentence would ALSO satisfy the task, it is
  not a distractor — leave it out and add a QA note naming it as an
  alternative valid answer the authors may want to accept.
- **"Circle the wrong one and write the correction"** → a `selection` item
  (which is wrong) PLUS a `slots` item (type the correction) per pair, or
  one combined approach of your choosing as long as both identification
  and correction are scored.
- **"Underline the errors [and write the corrections]"** → a `selection`
  item with `multi: true` over candidate phrases (the real errors plus the
  passage's CORRECT phrases of the same kind as distractors) PLUS a `slots`
  item for the corrections.
- **"Write the letter in the correct column" / "sort into groups"** → a
  `matching` item, left = the items, right = the columns/groups.
- **"Cover the column and test yourself"** → a scored `matching` item over
  the table's terms and meanings, with explanations built from the table's
  own content.
- **"Write R or I" / "circle" / "tick" / "cover it with your hand" /
  "check Part 2"** and any other paper-mechanics instruction → rewritten
  for the screen. Where the screen genuinely can't reproduce the mechanic
  (e.g. hiding a text after one reading), rewrite the instruction honestly
  ("without scrolling back up…") and add a QA note. No paper-only wording
  may remain in any `prompt`, instruction or theory text.

===== USING THE PDF's OWN ANSWER KEY =====

If the PDF has an answers/explanations section, it is the source for
explanation text: merge each answer's stated reason into the matching
sub-part's explanation — do not regenerate an explanation the PDF already
gives, and do not paraphrase it into something vaguer. Two adjustments are
required, not optional:
- Rewrite letter/position references (see "The player shuffles").
- **If the key is wrong** — its answer is ungrammatical, contradicts the
  PDF's own rule, or contradicts a fact stated elsewhere in the PDF — do
  NOT silently follow it. Make the scored answer (`correctOptionIds`,
  `acceptedAnswers`, ordering, pairs) the correct one, adjust that
  sub-part's explanation to explain the correct answer, and add a QA note
  under "Answer-key problems" naming the item, what the key says, and what
  you used instead. When you are unsure whether the key is wrong, keep the
  key's answer and list the item under "Ambiguous items" instead.

===== SELF-CHECK (do this for every lesson before you output it) =====

You cannot run the validator, so walk through this list for each lesson:
1. Block ids unique within the lesson; every slug is kebab-case.
2. No empty InlineContent and no empty run text anywhere; no newline or tab
   in any string except the two `description` fields.
3. Every table row has exactly `header.length` cells.
4. Per practice block: every `explanationRef` resolves (key or fallback),
   and every `explanations` key is referenced by something.
5. `selection`: ≥2 options, distinct texts, ≥1 wrong option, exactly one
   correct id when `multi: false`.
6. `matching`: pair ids distinct; no left id in two pairs.
7. `slots`: count of `___` in `prompt` == `gaps.length`; canonical answer
   first; contractions/alternatives listed.
8. No letter/position references to options; no "Section X" / "Part 2" /
   page references; no paper-only wording.
9. Every converted block has `convertedFrom` AND a QA line.
10. No keys beyond those listed in this file; no `qaNotes`; no comments.

===== QA REPORT (separate from the JSON) =====

Give each lesson's notes with that lesson's turn, and in the final turn the
collected report, in markdown, covering for THIS course:
- **Mark mapping** — what mark_a and mark_b mean in this draft (or "not
  used").
- **Lesson plan** — each lesson's slug, title, source PDF section(s),
  estimated minutes; every merge you made and why; every lesson longer than
  10–15 minutes; every lesson that is not "theory then practice, repeated"
  in the PDF.
- **Converted blocks** — `<lessonSlug>/<blockId>`: converted from `<...>` —
  `<what changed>`.
- **Unsourced content** — every drafted (not sourced) explanation and
  model answer.
- **Answer-key problems** — every place the key was wrong and what you used
  instead.
- **Ambiguous items** — anything a learner could reasonably answer another
  way, named specifically (item, the other valid reading, alternative
  answers the authors may want to accept or distractors you removed).
- **Internal inconsistencies** in the source PDF (a fact stated one way in
  one place and another way elsewhere), named specifically.
- **Figures** — every figure redrawn as table/list/prose, by block id.
- **Missing material** — pages or sections that seem absent from the PDF
  you were given; say so rather than inventing content to fill the gap.

This report is not part of the importable file. It goes to whoever reviews
the draft (partner + maintainer) alongside the JSON.
