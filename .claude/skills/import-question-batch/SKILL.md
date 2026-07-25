---
name: import-question-batch
description: Import a new batch of externally-authored quiz questions into the Supabase questions table. Use when a batch of question JSON arrives (e.g. in authored/), when asked to import authored questions, enrich the question bank, or ingest a new subject's questions.
---

# Importing a new question batch

Authored batches are JSON arrays produced by an external LLM. Each element carries
exactly seven keys — no system fields:

```json
{ "subject": "<subject-id>", "subtopic": "<subtopic label>", "difficulty": "easy|medium|hard",
  "question": "...", "options": ["a","b","c","d"], "correct_answer": "<one option verbatim>",
  "explanation": "..." }
```

`options` is either 4 strings (multiple choice) or exactly `["True","False"]`
(true/false). The importer derives `type` from the count and pads a true/false row to
the stored 4-tuple `["True","False","",""]` — do not treat a 2-option row as broken.

The import machinery already exists — **do not rebuild it**. Your job is to inspect,
gate, register any new subject, then run the importer.

## 1. Locate & inspect

Default location is `authored/*.json` (one file per subtopic), or the path the user gives.
For each file confirm: array shape, 4 options per row (or exactly `["True","False"]` for a
true/false row), `correct_answer` is one of the options verbatim, difficulty spread, and the
`subject` / `subtopic` values.

## 2. Coherence gate — report, don't silently import

Reject and surface rows that are **genuinely broken**: missing keys, `correct_answer` not
among the options, an option count that is neither 4 nor a valid `["True","False"]` pair,
empty/duplicate options, or an off-topic / factually wrong answer. If a batch is largely
broken, stop and report — don't import junk.

These are **NOT** blockers (standard handling, do not flag as problems):

- **Inline scaffolding** — markers like `(Landmark #N)`, `(Distractor A #N)`,
  `(Workflow Impact #N)`, `(Technical Principle #N)`, and stem ids `(ID/Ref/Code #N_hash)`.
  The importer strips these automatically via `stripAuthoringArtifacts` before hashing/insert.
- **Correct answer always in the same position** (e.g. always option A). Options are
  shuffled on the quiz side — **never reorder or shuffle at import**.

## 3. Register a new subject if needed

If a row's `subject` id is not yet in [data/subjects.json](../../../data/subjects.json),
adding it is **standard procedure, not a blocker**. Append a `Subject` entry
(`types/index.ts` `Subject`):

```json
{ "id": "<subject-id>", "name": "<Display Name>", "icon": "<ICON_MAP key>",
  "color": "#rrggbb", "bg": "#rrggbb", "tags": [], "subtopics": ["<all distinct subtopics in the batch>"] }
```

- `icon` must be a key in `ICON_MAP` in
  [app/components/SubjectGrid.tsx](../../../app/components/SubjectGrid.tsx) (Calculator,
  Atom, FlaskConical, Leaf, Landmark, Globe, BookOpen, Code, TrendingUp, Brain, Palette,
  Music, Languages, Clapperboard, Trophy, Gamepad2, Microscope). If none fits, add a new
  lucide-react icon to that map.
- Pick `color`/`bg` in the style of sibling subjects (a saturated color + its pale tint).
- `subtopics` must list **every** distinct subtopic used by the batch — the importer
  rejects any `subtopic` not listed under its subject.

`data/subjects.json` is static config, not a DB migration — edit it directly.

## 4. Import

Run per file against the live cloud Supabase (service-role key from `.env.local`):

```
npx tsx --env-file=.env.local scripts/import-authored-questions.ts "<file>" --source ai_generated --status approved
```

- Default good-batch flags: `--source ai_generated --status approved` (live in the pool
  immediately). Use `--status pending` only if the user wants admin review first.
- The importer dedups by `content_hash`; re-running skips duplicates. To re-import a
  **corrected** file (answer/difficulty/explanation fixed without changing question text),
  add `--sync` so matching rows are updated in place instead of skipped.
- It runs against the real project (`kumrlovftctxcbbbmnfy`) — the write is not reversible
  via the script. Import only after the coherence gate passes.

## 5. Report

Per file, report inserted / duplicate / updated counts and list any rows the gate
rejected. If a new subject was added, say so.

## Notes

- See the [verify](../verify/SKILL.md) skill to launch the app and spot-check the imported
  questions in the quiz UI afterward.
- DB *migrations* are user-applied (write the SQL and stop) — but this importer is a script
  the skill runs itself; only `.sql` files under `supabase/migrations/` are hand-off.
