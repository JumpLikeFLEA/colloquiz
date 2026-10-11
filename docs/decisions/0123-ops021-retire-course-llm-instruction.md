# 0123 — OPS-021: delete docs/instruction_external_LLM_course.txt

Status: **decided unattended** (OPS-021 ran `--no-approval`), open to
correction.

## Context

`docs/instruction_external_LLM_course.txt` (last touched in `4b035b9`,
"Courses - deactivated") is a paste-into-the-LLM instruction for a COURSE
STAGE of the retired Colloquiz course schema: stages with theory, variant
groups and a knowledge check (its own header and the `"key"`/`"groups"`
JSON shape). That schema no longer exists (0018 Decision 1). The live
drafting prompt for English lessons is `prompts/draft-lesson.md` (0028).

`rg -n instruction_external_LLM_course` before the change printed four hits:

- `prompts/m3-cohort-backlog.md:132` and `:421`, two lines of the M3
  planning prompt naming the file as a place a new block kind must enter;
- `scripts/board/backlog.mjs:2898` and `:2907`, this card's own title and
  acceptance line.

## Decision 1 — delete, not archive

The card allowed either. Deleted: the file describes a schema nothing can
import any more, so an archived copy has no reader, and git history keeps it
(`git show 4b035b9:docs/instruction_external_LLM_course.txt`). The repo has
no archive path convention to put it under.

## Decision 2 — repoint the two backlog-prompt references

Both lines in `prompts/m3-cohort-backlog.md` now name
`prompts/draft-lesson.md`, the prompt that actually describes the lesson
document. The two hits in `scripts/board/backlog.mjs` are the card's own
text and stay, so the issue body stays reconcilable with backlog.mjs.

`docs/instruction_external_LLM.txt` (no `_course`) is the live Colloquiz
QUIZ-question instruction, read by `scripts/build-content-prompts.ts`; it is
a different file and is untouched.

## Revisit if

Someone needs the stage-authoring instruction again, which would mean the
retired course schema is coming back; restore it from `4b035b9`.
