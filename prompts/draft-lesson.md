<!-- CNT-005 (docs/decisions/0028): the scripted drafting step was dropped —
     courses are now drafted in a chat session from the partner PDF. This is
     the durable artifact: paste it into the chat session alongside the PDF.
     The resulting authored/courses/<slug>.json must still pass
     `npx tsx --env-file=.env.local scripts/validate-course-file.ts <file>`
     before it is handed to scripts/import-lesson.ts (CNT-004). Moved
     verbatim from scripts/draft-lesson.ts's SCHEMA_PROMPT constant — do not
     paraphrase or trim when editing; extend it the same way that file's
     comments described extending it. -->

You are drafting a Colloquiz "Alliengll" English mini-course lesson document from a
partner-authored PDF. Output ONLY valid JSON in a single ```json fenced code block —
no prose outside the fence. Follow the shapes below EXACTLY; any field not listed is not
allowed (schemas are strict — an extra key is a validation error).

===== LESSON DOCUMENT =====
A lesson "document" is a JSON ARRAY of blocks, in reading order. Each block is either a
THEORY block or a PRACTICE block.

Every block needs a unique "id" (short kebab-case string, unique within the lesson) and
"kind": "theory" | "practice".

----- INLINE CONTENT -----
Any field typed InlineContent below is an ARRAY of "runs":
  [{ "text": "some text", "marks": ["emphasis"] }, { "text": " more text" }]
"marks" is OPTIONAL, an array drawn from: "emphasis", "english", "mark_a", "mark_b".
- "english": marks a run as an English-language span (rendered lang="en"). Use it for any
  English example sentence embedded in Russian-language explanation prose. This course's
  own instructional text is in English already, so "english" is rarely needed here except
  inside a Russian gloss, if you add one.
- "mark_a" / "mark_b": a CONTRASTING pair for this course's own grammar contrast (past
  simple vs. present perfect). Use mark_a for past-simple verb forms/examples and mark_b
  for present-perfect verb forms/examples inside worked examples and timelines, so a
  learner can see the contrast highlighted without reading the words. A run cannot carry
  BOTH mark_a and mark_b. Do not invent a third mark.
Every field typed "string" (not InlineContent) below is PLAIN TEXT, single line, no
markup — do not wrap it in the run-array structure.

----- THEORY BLOCKS (kind: "theory") -----
heading:   { id, kind:"theory", type:"heading", level: 1|2, text: InlineContent }
prose:     { id, kind:"theory", type:"prose", text: InlineContent }   // ONE paragraph per block
example:   { id, kind:"theory", type:"example", label?: string, text: InlineContent }
callout:   { id, kind:"theory", type:"callout", variant: "tip"|"note"|"warning", text: InlineContent }
list:      { id, kind:"theory", type:"list", ordered: boolean, items: InlineContent[] }
image:     NOT AVAILABLE — this PDF's figures are hand-drawn timelines; redraw them as
           "table" or "prose" blocks instead. Do not emit an "image" block.
video:     NOT USED for this course — omit entirely.
self_check: { id, kind:"theory", type:"self_check", prompt: InlineContent,
              response: "none"|"short"|"long", modelAnswer: InlineContent,
              checklist?: string[] (min 1 item if present) }
  - response:"none" is a "check your thinking" reveal with no writing box (use for the
    PDF's own CHECK YOUR THINKING boxes: prompt = the question, modelAnswer = the ANSWER
    text given).
  - response:"short"|"long" is for open-writing tasks (rewrite, reconstruct, build a
    sentence, the 120-150 word task): prompt = the instructions, modelAnswer = the PDF's
    own model answer/worked example for that task (if the PDF gives one) or a faithful
    model answer you write from the PDF's material, checklist = 2-4 short self-assessment
    items (e.g. "Used past simple for the prediction itself", "Used present perfect for
    the outcome").
  - self_check is NEVER scored and never counts as a practice block.
table:     { id, kind:"theory", type:"table", header: InlineContent[] (>=1 col),
             rows: InlineContent[][] (every row same length as header), caption?: InlineContent }

----- PRACTICE BLOCKS (kind: "practice") -----
A practice block is an item envelope: { id, kind:"practice", type: <one of the 5 below>,
payload: {...}, convertedFrom?: string }. "convertedFrom" is OPTIONAL and used ONLY for a
block converted from a paper-only task (see CONVERTING PAPER-ONLY TASKS below) — set it to
the ORIGINAL paper instruction, verbatim or near-verbatim from the PDF, not a summary.
Every other practice block omits it entirely. EVERY payload needs "explanations" (an object
mapping ref -> explanation
string) and MAY have "fallbackExplanation" (a string) — every explanationRef used inside
the payload must resolve to a key in "explanations" OR a "fallbackExplanation" must be
set. Prefer a SPECIFIC explanation per sub-part over one shared fallback whenever the
PDF's Part 2 answer key gives a per-item reason — that is real authored content, not a
guess. Only use a shared fallbackExplanation when the PDF gives one shared reason for a
whole task, or when no specific reason exists in the source (and in that case ALSO add a
one-line note in your "qaNotes" for this lesson: "<blockId>: no source explanation in the
PDF — explanation drafted, not sourced").

selection (MCQ single, MCQ multi, or True/False as ONE choice):
  { prompt: string, multi: boolean, options: [{id, text: string}, ...] (>=2),
    correctOptionIds: string[] (>=1), explanationRef: string,
    explanations: {...}, fallbackExplanation?: string }

selection_grid (inline True/False over N independent statements):
  { prompt: string, rows: [{id, statement: string, correct: boolean, explanationRef}, ...] (>=1),
    explanations: {...}, fallbackExplanation?: string }

ordering (a permutation of N elements, authored IN THE CORRECT ORDER):
  { prompt: string, elements: [{id, text: string, explanationRef}, ...] (>=2),
    explanations: {...}, fallbackExplanation?: string }

matching (a set of pairs between a left list and a right list; either side may have
unmatched distractors):
  { prompt: string, left: [{id, content:{kind:"text", text: string}}, ...] (>=1),
    right: [{id, content:{kind:"text", text: string}}, ...] (>=1),
    pairs: [{id, left: <left id>, right: <right id>, explanationRef}, ...] (>=1),
    explanations: {...}, fallbackExplanation?: string }

slots (N gaps in a prompt string, each gap marked "___" IN ORDER; one gaps[] entry per
"___", same order they appear in prompt):
  { prompt: string (contains "___" once per gap), input: "typed"|"drag",
    gaps: [{id, acceptedAnswers: string[] (>=1, every acceptable wording), explanationRef}, ...] (>=1),
    explanations: {...}, fallbackExplanation?: string }

----- CONVERTING PAPER-ONLY TASKS (docs/decisions/0022 Decision 6) -----
Some of this PDF's tasks only work on paper and MUST be converted to a scorable form.
Mark EVERY conversion TWICE, in BOTH places — they serve different readers and neither
substitutes for the other:
1. Set "convertedFrom" on the converted block itself (see PRACTICE BLOCKS above) to the
   ORIGINAL paper instruction — this is what a future editor shows the partner inline,
   on the exact block, so she can review the conversion without leaving the block.
2. ALSO add a one-line note in "qaNotes": "<blockId>: converted from <original paper
   instruction> — <what changed>" — this is the fuller "what changed" explanation for
   the standalone QA report.
Do not do only one of the two.
- "Copy/find the sentence from the text" (Section D) -> a "selection" or "matching" item
  choosing/pairing the right sentence(s) from a fixed list of candidate sentences drawn
  from the text (do not require free-text sentence copying).
- "Circle the wrong one and write the correction" (Section F, task 6, "Spot the error")
  -> a "selection" item (which of A/B is wrong) PLUS a "slots" item (type the correction)
  for each pair, OR a single combined approach of your choosing as long as both the
  identification and the correction are scored.
- "Underline the errors [and write the correction]" (Section F, task 10, "Correct the
  paragraph") -> a "selection" item with multi:true over candidate verb-phrase options
  (the errors to identify) PLUS a "slots" item for the four corrections.
- Any other paper-only instruction ("write R or I", "circle", "cover it with your hand",
  "check Part 2") must be REWRITTEN for the screen — do not leave paper-only wording in
  a prompt or instruction string.

----- PART 2 ANSWERS -----
The PDF's "PART TWO — Answers & explanations" section is the source for
explanationRef text: merge each answer's "WHY" into the matching sub-part's explanation
— do not regenerate an explanation the PDF already gives you.

===== YOUR JSON OUTPUT FOR A LESSON DOCUMENT CALL =====
```json
{ "document": [ ...blocks as above... ], "qaNotes": ["<blockId>: ...", ...] }
```
"qaNotes" is REQUIRED (use an empty array if this lesson has nothing to flag) and holds
ONLY: converted-task notes and unsourced-explanation notes for blocks in THIS lesson.
