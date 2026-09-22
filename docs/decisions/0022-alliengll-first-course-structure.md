# 0022 — Alliengll: course structure and block additions from the first real course

## Context

The partner supplied the first real Alliengll course ("Future Imperfect",
present perfect vs past simple, B1). It is a complete mini-course, roughly 95
minutes long, organised in sections A–I, with a Part 2 answer key. The file is
in `authored/`, which is gitignored.

Checked against 0018, the lesson-document model holds: every section is an
ordered sequence of theory and practice. The block vocabulary from 0020 does
not hold. The course needs:
- open writing tasks (about a third of it);
- tables;
- a two-colour tense-highlighting system used from page 7 to the end;
- level and time metadata on every section.

Decided by the owner on 2026-09-22.

## Decision 1 — One PDF is one course; one section is one lesson

- A partner PDF maps to one course, and each lettered section maps to one lesson.
- Sections run 5–25 minutes. That suits an audience arriving from a reel; a
  95-minute lesson would not.
- **Exception: a section that works on another section's material is merged
  into it.** In this course, D (find sentence pairs in the text) is merged into
  C (the text), making one 11-minute lesson.

  The rule is general: a lesson must be completable without opening a
  different lesson.
- The course's "pause here" banner is dropped, because lesson boundaries
  already provide the pauses.
- The default free-sample lesson (0018 Decision 4) is therefore Section A.

## Decision 2 — An unscored self-check block

A new **theory-side** block, `self_check`, holds:
- a prompt;
- an optional learner response box (`none | short | long`);
- a model answer, revealed on request;
- an optional self-assessment checklist.

It covers open writing (rewrite, join, form questions, build from prompts,
reconstruct from memory, the 120–150-word task) and "check your thinking"
reveals (a `self_check` with no response box).

- It is **never scored**. It does not pass through `parseItem`, does not
  enter the Σearned/Σpossible aggregate (0016), and does not count towards
  `published_item_count`.
- In M1 the learner's response is not persisted. Whether it is kept, for
  example as a local draft, is M2's design.

Converting these tasks to multiple choice was rejected, because it removes
the production practice the partner built the course around. Dropping them
was rejected for the same reason.

## Decision 3 — A table block

A `table` theory block: a header row, body rows, an optional caption, and
cells carrying the same inline markup as prose.

It is needed for vocabulary tables, form and question tables, and rubrics.
Grammar material leans on tables constantly; this was not a one-course quirk.

## Decision 4 — Two contrasting highlight marks

Inline markup gains two marks, `mark_a` and `mark_b`, alongside emphasis and
English-span.

- They are **course-agnostic**. This course uses them for past simple versus
  present perfect; another course might use them for countable versus
  uncountable. The meaning lives in the content, not the name.
- They must be distinguishable **without colour** (for example, a solid
  underline versus a dashed underline with a tint), and use tokens only.

## Decision 5 — Catalog metadata

- **`courses.level`:** the CEFR level (A1–C2), required. The audience is
  segmented by level.
- **`lessons.estimated_minutes`:** a positive integer written by the author,
  readable without reading the lesson document (the same reasoning as
  `published_item_count`). It is never derived from content.

## Decision 6 — Drafting converts paper tasks, and says so

Some paper tasks become scorable only by changing their form:
- "copy the sentence from the text" becomes a selection over the text's sentences;
- "circle the wrong one and write the correction" becomes a selection plus slots;
- "underline the errors" becomes a multi-select over verb phrases plus slots.

The drafting step may make these conversions, but must mark each converted
block for the partner's review, because it changes her exercise design.

- Part 2's answer key is merged into per-sub-part explanations rather than
  generated anew.
- Paper-only instructions ("write R or I", "circle", "cover it with your
  hand", "check Part 2") are rewritten for the screen.

## What would make us revisit this

- **LLM grading arrives.** `self_check` with a response box is the
  migration path to a scored free-writing item type. Convert deliberately,
  never by silently starting to score `self_check`.
- **A course needs more than two contrasting marks.** Generalise the mark
  set then, not preemptively.
- **A section too long to be one lesson** (this course's F runs 25 minutes).
  The partner splits it in the editor. No automatic splitting.
