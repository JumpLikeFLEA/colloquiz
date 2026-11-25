# 0236 — PROG-011: notebook data model, copy rule and retention

Status: decided by the owner on 2026-11-25 (PROG-011, #327). Nothing is built. Settled inputs are in 0235.
No code and no migration in this card. Each section keeps the options that were laid out; "Recommended" reads
as decided, with the owner's changes under "The owner's picks".

## The owner's picks (2026-11-25)

All as recommended, except:

1. **Repeat run (section 4): (a),** any before take ever. As recommended, confirmed by name.
2. **Teacher view (section 5): summaries are included, with a baseline rule.** A final or interim summary
   compares two takes, and can quote the first one. The teacher gets it only when they can also read the
   baseline's lesson:
   - `notebook_summaries.baseline_lesson_id` (FK lessons, ON DELETE SET NULL) is written at copy time from the
     baseline `voice_analysis_finish` was given (`p_baseline`, stored as `baseline_submission_id`).
   - If none was stored for a final or interim summary, the teacher does not get it. A `first` summary needs
     only its own lesson.
   - The link-statement bullet and privacy section 5 name "AI summaries" explicitly.
   - The teacher view shows "AI feedback can be wrong. It is not a grade."
3. **To try (section 6): the no-argument form, with `before_taken`,** and the fail-closed TRUE kept for a
   started course that is no longer published or entitled to the caller. It amends 0235's "only a boolean".
4. Both cards under "Found on the way" are created: OPS-044 (#338) and TCH-019 (#339).

Evidence marked **[proto]** is a throwaway prototype on the local stack (Postgres 17.6, 3 takes, 2 done
analyses, both shown), run inside a transaction that was rolled back. **[lock]** is a two-session test on a
three-table replica in a scratch database, dropped afterwards. Neither is in the repo. The
picked To try form, with forging attempts, was probed the same way on 2026-11-25. Local counts are small: the copy figures are 2 of 2, not a load test.

## 1. Tables

| | Shape | For | Against |
|---|---|---|---|
| A | `notebook_entries` (kind said / fix / own) + `notebook_summaries` | One list to filter by tab and course; a summary has different columns and is one per take | Nullable columns, held by a per-kind CHECK |
| B | Three entry tables + summaries | No nullable columns | Four policies, four deletes, four exports for one list |
| C | One JSONB document per learner | One read | A replace would have to edit the document, so the FK no longer gives 0235's rules |

**Recommended: A.**

- `notebook_entries`: `id`, `user_id` (FK profiles), `kind`, `submission_id` (FK `voice_submissions`
  ON DELETE CASCADE; NULL exactly when `kind = 'own'`), `course_id`, `lesson_id`, `course_title`,
  `lesson_title`, `phrase`, `phrase_key` (generated: trimmed, lower-cased, the three typographic apostrophes
  folded to `'`), `quote`, `exact`, `correction`, `note`, `created_at` (the take's `submitted_at` for a copied
  row), `updated_at`. Indexes: `(user_id, created_at DESC)`, `(submission_id)`.
- `notebook_summaries`: `submission_id` PK (same FK), `user_id`, course and lesson columns as above, `kind`
  (first / final / interim), `summary`, `next_step`, `goal`, `taken_at`, `baseline_lesson_id` (pick 2; only the teacher read uses it).
  Index `(user_id, taken_at DESC)`.
- `voice_analyses.notebook_copied_at`. `authenticated` holds column-level SELECT there (096), so the new
  column is unreadable without a grant, and gets none.

**Limits.** Copied text needs no CHECK, which would be one more way for a copy to fail: it is already bounded
when written, at 60 characters per listed expression (`taskBlocks.ts`), 200 per quote (`QUOTE_MAX_LENGTH`) and
600 per text (`TEXT_MAX_LENGTH`, `validate.ts`). Own notes: phrase 1–200, note up to 500 (homework's note
limit, 080), at most 1,000 per learner by a BEFORE INSERT trigger with PT429 (the 038/096 pattern).

**Row count.** A take gives at most 24 said, 1 fix and 1 summary; a slot holds one take. Eleven courses have a
list in the local `authored/` files (0235 fact 15), so before, interim and after in each is at most
11 × 3 × 25 = 825 entries, plus weekly takes and up to 1,000 own notes. [proto] 2,002 rows for one learner:
744 kB with indexes, 235 bytes a row on average, read and sorted in 0.8 ms.

**A consequence:** PostgREST stops at 1,000 rows (`supabase/config.toml:18` locally; the hosted value is
assumed the same, not checked), so a heavy learner's plain select would be cut silently. The page, the file
and the export therefore read through one SECURITY INVOKER function that returns a single JSONB value. RLS
still decides the rows.

**Staying readable.** "lessons: published read" hides a lesson that is archived or whose course is unpublished,
unless the learner is entitled (local `pg_policies`), so a join alone would lose the name. Both titles are
**snapshot at write time**; the page shows the current title when it can read one, else the snapshot, and a
lesson it cannot read has no link (the `learnerList.ts` rule). Rename: new title. Archive or unpublish: old
title, no link. Rejected: a definer reader for current titles, which adds a read path around RLS for a label.

**Deleting a draft course.** A copied row cannot meet it: the purge keeps the take, and a take is a blocker
('recordings', 109:529). An own note's `course_id` / `lesson_id` are ON DELETE SET NULL and the snapshot keeps
the label; a note is **not** a new blocker, because a learner's private note would otherwise stop an author
deleting a course and reveal that it exists. In practice a signed-in reader's `lesson_opens` row already blocks.

## 2. Where the copy runs, and recovery

| | Where | If the copy fails | Verdict |
|---|---|---|---|
| A | Inside `voice_analysis_finish`, in a subtransaction | Analysis still done; marker stays NULL; sweep recovers | **Recommended** |
| B | AFTER UPDATE trigger on `voice_analyses` | Same | **Can fail a learner's resend by deadlock** |
| C | App pipeline, a second RPC after `finish` | Same, but a crash between the two calls is also a missing copy | Not the same transaction (0235 B) |

**Why not B.** `submit_voice_recording` locks the take, then the cascade needs its analysis row. A trigger
holds the analysis row already, and its insert then needs KEY SHARE on the take: the reverse order. [lock] with
the window widened by `pg_sleep`, B deadlocked 2 of 2, and both times Postgres aborted the **replace**, so the
learner's Send would fail. With A, which takes KEY SHARE on the take before updating the analysis, the same
race finished cleanly 2 of 2 (the new take in place, no analysis, no entries). How wide the real window is was
not measured. A trigger cannot take the lock first, because the row is locked before it fires.

Rule for PROG-012: every path that touches a take's analysis and its copies (finish, sweep, hide) locks
`voice_submissions` first. A re-emits `voice_analysis_finish`, `hide_voice_analysis` (one added DELETE of the
take's entries and summary) and `voice_analysis_sweep`, each from its latest body; B would re-emit only the
sweep, which is its one advantage.

**Recovery.** The owner's lean holds with one change: the marker decides, not "has no copied summary". A copy
sets `notebook_copied_at` in the transaction that inserts; the sweep copies only done, shown analyses whose
marker is NULL, each in its own subtransaction, so one bad row stops neither the others nor the sweep's own
job. A row that never parses is retried daily and logged. [proto], printed:

- Deleted a copied summary and a said entry, ran recovery: `recovered 0`. Re-applied the body: still 1
  summary, 2 entries.
- Forced copy failure: finish returned true, status `done`, uncopied, 0 entries. Recovery: 1, then 0 on the
  second run; entries fix 1, said 1, summaries 1. Finish again on the done row: false, entries still 2.
- Stored result `"nope"`: still `done`, recovery 0. Result repaired: 1, then 0; entries 2.
- `voice_mark_removed`: analysis 0, entries 1, summary 1 kept. Take deleted as a replace does: its entries 0,
  the control take's 1.

Hiding was not run in the prototype; PROG-012's matrix covers it.

**Parity with `parseStoredAnalysis`.** That code checks offsets in UTF-16 units; SQL counts code points, so an
emoji in a transcript would make the two disagree. Recommended: SQL checks that the quote occurs in the
transcript, not its offsets. `validate.ts` writes only quotes it located, so they differ only on a hand-made row.

## 3. Backfill

Runs `_notebook_copy` over done, shown analyses, guarded by a table-absent flag read before CREATE (0235). The
marker makes a second run copy nothing even without the guard, so there are two independent reasons.
[proto] done and shown 2, backfilled 2, summaries 2; re-apply "backfill skipped".

## 4. Meanings

| Question | Options | Recommended |
|---|---|---|
| A started course | (a) `/my`'s list: attempted, enrolled or granted; (b) an open, an attempt or a take in it | **(b).** (a) would list phrases of a granted course nobody has opened. Opens alone miss an attempt carried over from a signed-out session |
| A phrase in two takes | (a) one stored row; (b) a row per take, merged on read by (course, `phrase_key`), newest quote shown | **(b).** Storing one row breaks the per-take cascade: replacing one take would delete the other's phrase |
| Which the number counts | takes' rows, or merged rows | **Merged rows:** the number equals the said rows under All courses. The same phrase in two courses is two, so the course chips add up |
| Deleting a merged phrase | newest row only, or all its takes | **All:** otherwise it seems to come back. Saying it again in a later take adds it again; To try may list it again (PROG-016 says intended) |
| A repeated own phrase | allow, merge, refuse | **Allow.** Two notes from two lessons differ; they are told apart by course and note |
| Deleting a summary | yes / no | **Yes** (0235 input 4 and OPS-043's text say until the learner deletes it). The card then shows the next newest; the marker keeps it gone |
| Repeat run's before take | (a) any take ever; (b) the current run's own | **(a).** A repeat learner has already seen the list in the first run. The cost: a run-2 baseline can be made after seeing it. (b) matches how the pipeline picks a baseline, per enrolment (`loadBaseline`), but hides To try again |
| A before block id changed by a republish | match today's block id, or the take's own version | **The take's own `lesson_version_id` document.** [proto] after changing the id: by today's id 0 takes, by its own version true. So a republish does not re-hide the list. (The pipeline's baseline does look up today's id; unchanged here) |

## 5. Teacher read path

- **An RPC, not a policy.** `_teacher_readable_lessons` and `_teacher_linked` are revoked from `authenticated`
  (080, 076), and a policy runs as the caller, so it could not call them; granting them would let any user ask
  about any pair. `linked_student_notebook(p_student)`, SECURITY DEFINER, keyed by `auth.uid()`, joins per
  lesson, returns copied rows only (`submission_id IS NOT NULL`), so own notes cannot be returned.
- **Also require `_is_teacher`: recommended yes.** 079 and 081 do; 078 and 080 do not. Without it, someone who
  lost every course and seat but still has an active link and an old assignment could call the RPC directly.
  A lapsed seat is still a teacher (082: the row exists), so 0155's read-only rule holds. The cost: that person
  keeps reading answers (080) and not the notebook, until a separate card aligns them (below).
- **Summaries too: yes, under pick 2's baseline rule.** 0235 says the teacher reads "entries"; the owner reads
  it to include AI summaries. In the RPC: a `first` summary when its lesson is readable; a final or interim one
  when its lesson AND a non-NULL `baseline_lesson_id` are readable. Said and fix entries quote only their own
  take (`validate.ts`), so they need only their own lesson. Consequences, all towards showing less:
  - an interim take that ran with no before take has no baseline, so its summary never reaches a teacher;
  - when the baseline take was replaced before a late copy ran (recovery or backfill),
    `baseline_submission_id` is already NULL (096, ON DELETE SET NULL), so neither does that one;
  - a baseline replaced AFTER the copy changes nothing: the lesson is the same;
  - a single assigned lesson holding only the final task gives its entries and no summary, unless the before
    task is in that lesson too.
- This is new reach: for an assigned lesson of a course they do not edit, a teacher today reads no AI analysis
  (096's policy is editors only). 0235 accepts it and OPS-043 states it.

## 6. To try: does the boolean leak?

The caller already sees, under RLS, every published course (listed or not) and its lessons' titles and counts.
So the boolean adds one fact: a course whose lessons they cannot open contains a before voice task. It carries
no phrase, lesson id or count.

- **Draft or unknown id.** If the answer were false for a course with no before task, a draft id would answer
  false and an unknown one could be told apart. Recommended: the closed answer is TRUE, for anything that is
  not published or entitled to the caller. [proto] three draft courses, none with a before task, and an id that
  does not exist all answered `t` to a stranger; published controls answered `f`, `f` and `t`, matching the
  truth. Anon: permission denied.
- **Archived lessons** are not counted: a learner without an entitlement cannot open one, so counting it would
  hide To try with no way to unlock it.
- **No probing at all, picked:** the function takes no id. It answers only for the caller's own started
  courses (section 4) and returns `(course_id, has_before, before_taken)`. The third is the caller's own data
  and is needed because a learner cannot read a superseded version's document (110's header), which the last
  row of section 4 relies on. Rejected: the strict form, one boolean for one id.
- **The started set cannot be forged.** The only writers check readability before writing: `record_lesson_open`
  and `record_lesson_attempts` ask `can_read_lesson` (056, 074), `submit_voice_recording` needs
  `_lesson_access_at` = open (096). The three tables have RLS on, SELECT policies only, and no INSERT grant.
  Printed on the local stack as a stranger: an open of a draft lesson and of an entitled one `not_readable`;
  attempts on both `inserted 0`; a take on the entitled one `lesson_not_open`; direct INSERTs into all three
  "permission denied"; courses answered after that: 0. Control, a readable lesson: open `ok`, attempt
  `inserted 1`, courses answered: 1.
- **Fail-closed, printed:** a started course with no before task, published `has_before f`; the same course set
  to draft, `t`. A learner with a before take: `t, t`. A learner who started nothing: 0 rows.

**Verdict: it does not leak; the fallback is not needed.** What remains: if the before task is in a paid lesson,
a free-sample learner sees no To try for that course. That is 0235's rule, not the boolean's.

**Cost per load.** [proto] 12 courses × 8 lessons, all with the largest local document (96 documents, 974 kB
stored, 1,746 kB as text), run as `authenticated`: the gate 15.8 ms, then 14.5 ms; the session read of the
lists 97.5 ms. Those two gate figures are the list-of-ids form. The picked no-argument form, with 97 opens and 961
attempts for the caller: 16.7 ms, then 14.3 ms, 13 courses answered. PROG-012 prints it again.

## 7. `/my`'s AI feedback list

| | Keep | Drop |
|---|---|---|
| Taps to a take's feedback | 1 | 3: notebook, unfold Recordings, lesson |
| Takes shown | newest 12 (`LEARNER_ANALYSIS_LIMIT`) | all |
| Mode off | empty | the notebook still shows copies |
| A purged take | gone | the row and its notes stay |
| A hidden analysis | not listed | its entries go; the recording row stays and its lesson says it was withdrawn |
| A failed or paused analysis | not listed | recording row, no notes |
| Kind pill (first / final / interim) | yes | only if the recording row shows it |
| Page | two lists of the same takes | one link; `/my` is at 175.2 of 180 KB (0235) |

**Recommended: drop it,** as the owner leans, in PROG-015 after PROG-014 is live, with the kind shown on the
recording row. What is really lost is the one-tap doorway.

## 8. Formats and text

**Account export.** `notebook: { entries: [...], summaries: [...] }`, each row with ids, kind, course and lesson
titles, text and dates; `EXPORT_FORMAT_VERSION` 17 to 18; one `EXPORT_CONTENTS` line: "Notebook — the phrases
you said, their fixes, the AI summaries and your own notes". All rows, not merged.

**Text file**, `alina-cher-notebook-YYYY-MM-DD.txt`, UTF-8 with a BOM (older Windows Notepad needs it for
Cyrillic), headings in the saved language, LF, sections with no rows left out, oldest course first, no AI text
re-worded:

```
ALINA CHER · NOTEBOOK
2026-11-25

== SUMMARY ==
Future Imperfect · Vocabulary · 12 Nov 2026
<summary>
Next step: <next step>          (or "Goal: <goal>"; neither: the line is absent)
AI feedback can be wrong. It is not a grade.

== PHRASES ==
Future Imperfect
- be about to
  You said: "I was about to leave" (close)      ("(close)" only when exact is false)
- [my note] on second thought
  <note>

== FIXES ==
Future Imperfect
- You said: "I have went"
  Better: "I went"
```

To try is not in the file: it is derived, not the learner's record. Every summary is listed, newest first.

**Privacy delta for OPS-043** (a draft; the owner reads the rendered diff there):

- 3.2, a new row: "Notebook — phrases you said in a recording with your own words, one correction per
  recording, and the AI summary with its goal or next step, copied from the AI feedback with the date, course
  and lesson; and notes you write yourself | To give you one place to keep them, after the recording is gone".
- 4: contract for the notebook; the linked teacher's view joins the existing teacher row.
- 5, teachers, first bullet: "…the written answers you sent for those lessons, and, from your notebook, the phrases and
  corrections copied from your recordings in those lessons and the AI summaries of those recordings (for a
  recording that is compared with an earlier one, only if the earlier one's lesson is also among those lessons).
  They never see notes you write yourself." When a link ends, the
  teacher no longer sees them. (Before PROG-020 ships this says they **may** see them, which stays true.)
- 5, voice recordings: the author's hide "also removes what your notebook copied from that feedback. Once the
  recording has been deleted at the end of its retention period, the author can no longer do this; only you can
  delete those entries."
- 7, a new row: "Notebook | Until you delete an entry or your account. Entries copied from a recording are also
  deleted when you replace it or its author hides the feedback. They are kept when the recording is deleted at
  the end of its retention period". The transcripts row keeps "deleted together with the recording", adds
  "except the copies in your notebook (below)", and its sentence about quotes of a first recording gains
  "unless a copied summary contains one".
- 8 (export list), 9 (erased outright) and 13 (version note) each gain the notebook. 12 is unchanged: no new
  AI call.

## What each card takes from this

- **PROG-012:** sections 1 to 6. Beyond its acceptance: `baseline_lesson_id`; the take-first lock order in
  finish, sweep and hide; and three teacher cells for pick 2: a final whose baseline lesson is not readable, one
  with no stored baseline, and a readable one as the control. The hide run, which the prototype did not do.
- **PROG-013:** "PROG-011's boolean" is the row of section 6; `has_before` TRUE with `before_taken` FALSE shows
  nothing. Merging and the phrases number: section 4.
- **PROG-015:** drop `/my`'s AI feedback list (section 7), with the kind shown on the notebook's recording row.
- **PROG-016:** own-note limits and duplicates (sections 1 and 4); deleting a merged phrase deletes all its
  takes' rows in that course.
- **PROG-019, OPS-043:** section 8.
- **PROG-020:** pick 2. The bullet names AI summaries; the view carries the "can be wrong" line; a summary that
  is not returned leaves no placeholder, so its absence says nothing about the baseline.

## What would make us revisit this

- Teachers find missing final summaries confusing (pick 2 hides one when the first lesson is not theirs to read).
- The sweep logs copy failures that are not one known-bad row.
- A learner reports a run-2 baseline spoiled by To try (section 4), or To try hidden behind a paid before task.
- Hosted PostgREST's row limit turns out to differ and the single-JSONB read is dropped.

## Found on the way (not this card)

- The account export reads each table with no paging (`app/api/account/export/route.ts`), so a learner with
  more than 1,000 rows in one (lesson attempts first) may get a truncated file. Hypothesis: not reproduced, and
  the hosted row limit was not read. Card: OPS-044 (#338).
- 078/080's answer readers do not require `_is_teacher`; 079/081 do. Card: TCH-019 (#339).
