# 0225 — Writing tasks: a written answer the teacher can read and answer

Status: decided by the owner in a planning session on 2026-11-10. WRITE-001
(the block, editor and practice mode) is built; the rest is not. The work is split into M4 cards WRITE-001..005
(`scripts/board/backlog.mjs`).

## Context

The owner asked for a new kind of exercise. When creating a course, the author
can add a **writing exercise**: a prompt and a free text field, where Enter
starts a new line. The author ticks whether the student's answer is sent:

- **Not ticked:** the exercise is for practice only, such as answering a
  question or telling a story.
- **Ticked:** the teacher sees the answer and writes feedback.

No AI is wanted now. Later there will be an AI check, depending on the learner's
subscription (free / standard / premium). The feature has to be built so that
can be added.

Before this decision the project said the opposite in three places:

- docs/decisions/0109 Decision 6 rejected "a written-answer task: a new block
  kind and a schema change". It said voice tasks and the final comment were the
  only human-reviewed things.
- `docs/handoff.md`, "Item types", described voice tasks as the only block a
  person reviews.
- `docs/handoff.md` defers `free_text`, an auto-scored item type, until LLM
  grading exists, and lists "LLM grading of free writing" as out of scope.

A writing task is not `free_text`. It is never scored, so it is a **task**, the
third block kind beside theory and practice, as a voice task is. `free_text`
stays deferred, and nothing here changes the item registry or the
`{ earned, possible }` contract.

There is no subscription or plan concept anywhere in the code or the database
today. The only tiers are `run_enrolments.tier` (basic / extended, which gates
calls) and `author_seats.kind` (`grep` over `supabase/migrations` and `lib/`,
2026-11-10).

## Decisions

The owner chose each of 1 to 4 from the options put to them. 5 to 14 come from
the design pass behind the cards, and each card may revise one with evidence.

1. **Who sends.**
   - A cohort enrolee's answer goes to the course's authors (`can_edit_course`),
     as voice feedback does today.
   - A student linked to a teacher who edits the course, or who assigned the
     lesson, sends to that teacher. That is the rule that already decides what a
     linked teacher may read (TCH-003, docs/decisions/0150) and whom a student
     may ask (0153).
   - Everyone else gets practice only: anonymous visitors, and signed-in
     learners who are neither enrolled nor linked.
   - Rejected:
     - Every signed-in learner sends to the course's authors. Free-funnel
       traffic would land in the partner's queue, which 0156 Decision 9 kept
       self-paced voice takes out of.
     - Cohort enrolees only.
2. **Resend.** A learner may edit and send again until the teacher publishes
   feedback. After that the answer is locked. This is the voice rule (0110).
   - Rejected: one send and then locked; editable at any time.
3. **Practice answers** are kept as a draft in the browser (localStorage), so a
   reload does not lose a long story. They are never uploaded.
   - Rejected: kept on screen only; saved to the account.
   - **Key (WRITE-001):** `alliengll.writing.draft.v1:<lesson path>:<block id>`,
     value `{"v":1,"text":"…"}`, capped at 4,000 characters. The lesson path, not
     the version id, so a republished lesson keeps its drafts. `lib/writing/draftStore.ts`.
     Read after mount, written 500 ms after the last keystroke and on `pagehide`;
     any storage failure falls back to memory. The Studio preview passes no lesson
     path and so keeps nothing.
4. **Studio.** The "Recordings" nav entry (0208) becomes "Reviews", with tabs
   Recordings | Written answers | AI feedback. The inbox's "Waiting for feedback"
   and the nav badge count both recordings and written answers.
   - Rejected: written answers mixed into the recordings queue; their own nav
     entry.
5. **Block shape:**
   `{ id, kind: "task", type: "writing", prompt: MultilineInlineContent, sendToTeacher: boolean }`.
   - It gets a new `type`, not a new `kind` (0100 Decision 1).
   - `sendToTeacher` is required and has no default, so the author's choice is
     frozen into the data (handoff, "Author intent is frozen into data").
   - The prompt takes line breaks, like the voice prompt (0224).
6. **Never scored or counted.** A writing task:
   - is not numbered "Exercise N of M";
   - is not counted in the progress strip;
   - is outside the lesson score and outside completion (0143);
   - is a cut point for `lesson_teaser` (055).

   `self_check` stays what the importer emits for open writing in a PDF. The
   import prompts are unchanged until a card says otherwise.
7. **The route is decided in one SQL function, `_writing_route(user, lesson)`.**
   It returns cohort (with the enrolment), linked, or no route.
   - The lesson must be open (`_lesson_access_at`).
   - The enrolment that opens the lesson wins, using 096's query.
   - An enrolee whose enrolment does not open the lesson gets no route. This is
     094's narrower rule: an enrolee's answer never falls through to the linked
     route.
   - Otherwise the route is linked if a live link exists for which
     `_ask_teacher_allowed` holds (latest body: 083).
   - **Cohort beats linked** when both apply. The cohort is the paid product that
     promises the author's written feedback.

   Both the page and the submit RPC call this function. The page only ever
   offers what the RPC will accept.
8. **One predicate decides who reads and answers a sent answer:
   `_writing_can_review`.** It is evaluated at read time.
   - Cohort: `can_edit_course`.
   - Linked: `_teacher_readable_lessons(teacher, student)` (080). An ended link
     or a deleted assignment therefore removes access at once, as the privacy
     policy's teacher section promises.
   - Teachers get no table policy. Studio reads only through a definer RPC.
   - Sending uses `_ask_teacher_allowed`, which has the seat-freeze clause.
     Reading and answering have no freeze clause: a lapsed seat keeps answering
     what was already sent to it (0155 Decision 5).
9. **Storage.** There are two tables, `writing_submissions` and
   `writing_feedback`. The second has the shape of `voice_feedback`, uses the same
   bold-paragraph body (0096, `_feedback_content_valid`) and the same one-way
   publish.
   - There is one current answer per slot: `(enrolment, lesson, block)`, or
     `(user, lesson, block)` on the linked route.
   - A resend updates the answer in place, so a draft feedback stays attached.
   - **The answer is capped at 4,000 characters** by a CHECK, about 650 words.
     That is below the feedback's 5,000.
10. **Retention.** An answer is kept until the account is closed, then deleted
    outright, as "Your answers" and "Messages" are. There is no purge job.
    - `delete_my_account` deletes both tables.
    - `course_delete_blockers` gains a `written_answers` blocker.
    - Ending a link removes the teacher's access but does not delete the
      answer.
11. **No "Ask the teacher" link on a writing card.** 081's
    `_attachment_normalise` accepts only exercises and voice tasks. A ticked
    task already reaches the teacher.
12. **No Telegram ping yet.** COH-011's claim function knows only `voice` and
    `final`. A ping is a follow-up.
13. **Hooks for the future AI check. Nothing is built now.**
    - **Who gets the check:** one SQL function, `writing_ai_allowance(user)`,
      reading a future plans table. This follows the rule that entitlement is
      decided in one place.
    - **Where it is called:** `submit_writing_answer`. That function returns
      JSONB on purpose, so an `analysed` field can be added.
    - **Where the result lives:** a `writing_analyses` table keyed by the
      submission, with `ON DELETE CASCADE`, like `voice_analyses` (096).
      - It must store the text it analysed, because answers are edited in place.
      - Its pipeline follows the voice one: injected dependencies, versioned
        prompts and the usage ledger (104), started in the route's `after()`.
    - **Not built now:** a plan or tier column, caps, an environment flag,
      provider code, or a revision column.
    - **Two consequences to settle when the card is written:**
      - An AI check on a practice answer would mean uploading text that today
        stays in the browser. That needs a privacy revision of its own.
      - handoff's "LLM grading of free writing" exclusion needs the owner to
        frame the check as feedback, not grading, as 0156 did for voice.
14. **Deploy order.**
    - The writing reads on the lesson page and in Studio fail soft, so the app
      code can ship before migration 109 reaches hosted. Learners then see
      practice mode.
    - The privacy revision (WRITE-004) is published before 109 is applied to
      hosted, because a written answer sent to a teacher is a new data category,
      which 0095 counts as material.
    - The account export reads strictly: one failed read fails the whole export.
      Its change (WRITE-005) is pushed only after hosted 109 is applied.

## Cards

- **WRITE-001** (#289) — the writing task block: editor and practice mode. No
  migration.
- **WRITE-002** (#290) — sending a written answer: storage, send and lock. Migration
  109 (built; applied to the local stack only, `supabase/verify/109_writing_submissions.sql`
  prints PASS). `_writing_route` returns `not_open` as well as `cohort`, `linked` and `none`, so
  the RPC can answer `lesson_not_open` and `no_route` separately; `writing_task_state` maps both
  to practice. A linked answer is readable by any teacher `_teacher_readable_lessons` lets read
  that lesson, not by one named teacher.
- **WRITE-003** (#291) — Studio Reviews: the Written answers tab, the inbox and the
  badge.
- **WRITE-004** (#292) — the privacy revision for written answers.
- **WRITE-005** (#293) — written answers on `/my` and in the account export.

Proposed but not on the board:

- a Telegram ping when writing feedback is published;
- written answers on `/studio/learners/[userId]`;
- writing drafts in the inbox's "Unpublished drafts";
- "Ask the teacher" on writing cards;
- import prompts that can emit writing tasks;
- a budget route for a lesson with a writing task;
- the AI check itself, after a plans decision.

## Revisit when

- A linked teacher who only assigned a cohort lesson as homework wants to see
  the answer. Decision 7 sends it to the course's authors.
- Free learners who are not linked should be able to send (Decision 1). That
  brings back 0156 Decision 9's flood concern.
- The owner decides on plans or tiers. That opens the AI check under
  Decision 13.
- The free lesson's JS budget cannot take the writing card's loader. The cards
  then use one lazy task chunk for voice and writing.
