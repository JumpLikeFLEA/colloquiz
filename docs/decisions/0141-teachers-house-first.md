# 0141 — Teachers on manual seats, built house-first

Status: decided by the owner, 2026-10-15, in a planning session (grill-me
over a seven-feature list). Every option below was put to the owner with a
recommendation; the owner's pick is recorded as **Decision**. Build cards
are listed at the end.

## Context

The owner's list, verbatim in substance:

1. A possible monetisation: English teachers pay a subscription for access
   to the app, so authors need an easy way to be added, maintained and
   controlled (today a course editor is added by hand).
2. Students write to authors in the app, not in Telegram or Instagram, with
   questions about content and tasks; authors already have an inbox.
3. A student can attach the task they struggled with to the message.
4. A student chooses between their voice takes; only the final one is sent
   and stored.
5. Authors organise their students into groups, at least visually in the
   Learners list.
6. A graphic calendar of calls, run deadlines and other significant dates,
   for students and teachers.
7. Homework: a teacher assigns tasks or courses and tracks progress.

What the code had on 2026-10-15 (read, not run):

- `course_editors` (029) has no owner or role column; grant and revoke are
  admin-only (`grant_course_editor`, `revoke_course_editor`, 029);
  `create_course` (067) is open to anyone who already holds an editor row;
  `courses.author_id` (041) exists but nothing in the app reads it.
- `learner_roster()` (063) lists anyone with activity on a course the
  caller edits. There is no grouping or tagging.
- `docs/release/legal/privacy-policy.md` §"Course authors" and 0109
  Decision 8: no individual score reaches an author.
- `lesson_attempts` (048, lines 42–51) stores `earned` and `possible` per
  block. **It stores no response.**
- No messaging table exists. `notify()` (013/024) is used only by Colloquiz;
  Studio has no bell.
- `app/components/lesson-player/blocks/VoiceRecorder.tsx` keeps only the
  last take in React state. The server keeps one `voice_submissions` row
  per enrolment × lesson × block, replaced on re-send until feedback is
  published (060).
- No deadline exists anywhere. Week opening dates come from
  `_lesson_access_at` (058) and are returned only while a week is still
  `scheduled`. Calls reach extended-tier learners only, via
  `course_calls()` (058).
- `app/components/ui/calendar.tsx` is shadcn's react-day-picker v8 wrapper
  under `// @ts-nocheck`; `package.json` has react-day-picker 10. Nothing
  imports it.
- Colloquiz's `groups` (014) and `tutor_students`/`assignments` (006) are
  tied to quizzes and are not reused.

## Decisions

### 1. What a paying teacher is

Options: own space; classroom only (no authoring); co-author in the public
catalogue; own space plus promotion.

**Decision: own space, and an admin can promote a teacher's course into the
public catalogue.** A teacher builds their own courses, invites their own
students and sees only those. Their courses are unlisted until promoted.

### 2. Billing

Options: manual seats; a merchant-of-record checkout now; free for now.

**Decision: manual seats.** Paid outside the app, like the first cohort
(docs/handoff.md, "Payments"). An admin grants a seat with an expiry. No
checkout, no webhook. The MoR route stays parked.

### 3. Who is a teacher's student

Options: an explicit link with consent; activity-derived (today's roster);
the teacher adds by email.

**Decision: an explicit link.** A learner opens a teacher's student-invite
link, or claims a run invite (linked to the invite's creator), and sees a
plain statement of what the teacher will see before confirming. Groups,
homework, messages and answers work on linked students only. The learner
can leave and the teacher can remove. The activity roster is unchanged.

### 4. A seat that lapses

Options: freeze; unpublish; manual only.

**Decision: freeze.** Studio turns read-only for that teacher: no create,
edit or publish, no new runs, invites, homework, groups or events, and
students cannot open new threads. Published courses stay playable and
everyone keeps the access they have, which keeps "anyone who has paid keeps
access" (docs/handoff.md, "Content ownership"). Unpublish was rejected for
breaking that promise.

### 5. Paid access to a teacher's lessons

Options: the teacher grants access; a link means access; free only.

**Decision: the teacher grants.** Cohort courses keep runs and invites.
For a self-paced course, an editor grants and revokes a
`course_entitlements` row (`source = 'grant'`) on their own course. The
single entitlement SQL function is unchanged; "a link means access" was
rejected because it changes that function.

### 6. What a linked teacher sees

Options: best score per lesson; completion only; full answers.

**Decision: full answers.** For a linked student, the teacher sees every
attempt with its answer per exercise and the best lesson score, on the
teacher's own courses and on courses the teacher assigned as homework. This
supersedes 0109 Decision 8 **for linked students only**; a learner who is
not linked is shown exactly what the roster shows today. It needs the
privacy-policy revision in Decision 19 before any of it ships.

### 7. Where answers are stored

Options: every signed-in attempt; linked students only.

**Decision: every signed-in attempt.** A nullable response column on
`lesson_attempts`, one write path for everyone. The learner and their
linked teachers can read it; nobody else. It also unblocks PROG-003
(resume) and restoring answers, which 0088 left as option B.

### 8. Message threads

Options: one conversation per student–teacher pair; one thread per
question, resolvable; one per course.

**Decision: one conversation per linked pair.** "Unanswered" means the last
message is from the student; that count feeds the Studio inbox and its
badge. No realtime: a page load shows new messages. The teacher may write
first. When the link ends, the conversation stays readable to both and
takes no new messages.

### 9. Who may start a conversation

Options: linked students only; any signed-in learner of the teacher's
course, behind a per-course switch.

**Decision: linked students only.** The free-course funnel cannot flood an
inbox; a free learner who wants help joins through the teacher's link.

### 10. Sending the exercise you are stuck on

Options: ask from the card with a frozen snapshot; a reference only; copy
and paste text.

**Decision: ask from the card.** An "Ask the teacher" link on every
exercise and voice-task card, shown to a linked student whose teacher edits
the course or assigned it. The message stores a frozen snapshot of the
exercise as rendered and, if checked, the student's answer, with a toggle
to leave the answer out. A reference only was rejected because a later edit
to the lesson would change what the teacher sees.

### 11. Voice takes

Options: up to five takes in memory; takes that survive a reload in
IndexedDB.

**Decision: in memory, up to five.** The card lists the takes, each with a
player, Delete and "Send this take", and says they are lost on reload. The
server is unchanged: one stored take per enrolment and task, replaced until
feedback is published.

### 12. Groups

Options: linked, private, multi-membership; any roster learner; visible to
students.

**Decision: linked students only, private, multi-membership.** Students
never see a group's name. A group is a filter in Learners and a homework
target; a student added to a group gets the group's open homework.

### 13. What homework can be

Options: a lesson or a whole course; down to one exercise; a course only.

**Decision: a lesson or a whole course,** from the teacher's own courses or
the public catalogue, assigned to students and/or groups. A lesson the
student cannot open yet may be assigned; its access state shows beside it.

### 14. When homework is done, and what a due date does

Options: any attempt with a soft due date; only attempts after assignment;
the teacher marks it done.

**Decision: done is PROG-004's definition of an attempted lesson, at any
time** (a lesson done before it was assigned counts). The due date is
information only: it never locks, and once past it reads "Was due 20 Oct",
not a red "Overdue" (docs/handoff.md, "Nothing demotivates the learner").
PROG-004 moves into M3 so homework and the course page share one rule.

### 15. What goes on the calendar

**Decision:** run start and end, week openings, calls (extended tier only,
as now), homework due dates, and custom events a teacher adds to a run or a
group ("Test day", "No call this week"). Voice-task due dates were offered
and not chosen: no such concept exists, and homework due dates cover it.

### 16. The calendar's form

Options: grid, list and `.ics`; list and `.ics`; grid only.

**Decision: a server-rendered month grid at `sm` and up, an agenda list on
a phone, on `/my` and in Studio, plus a private `.ics` subscription feed.**
No new dependency; the vendored `ui/calendar.tsx` is not used.

### 17. Notifications

Options: badges now and Telegram later; Telegram from day one; in-app
only.

**Decision: badges now, Telegram later.** The core cards show counts in
Studio and on the learner's account chip and `/my`. Telegram pings are
separate cards that reuse COH-010's sender.

### 18. Where authors are managed

Options: `/studio/authors`; `/app/admin/authors`.

**Decision: `/studio/authors`, admin-only.** Today's editors become seats
with no expiry; the partner holds the house seat. Co-editor grants stay
admin-only.

### 19. Legal

Options: one decision card that gates the first external teacher; policy
rows drafted per card.

**Decision: both levels.** M3 gets one privacy-policy revision covering the
house-teacher features (stored answers, the link, what a linked teacher
sees, messages, groups, homework, the calendar feed). M4 gets a
`type:decision` card on teacher terms and data roles (controller or
processor); it gates onboarding the first external teacher, not building.

### 20. Attribution

**Decision: "By <name>" on a non-house teacher's course page.** House
courses show nothing, as now.

### 21. Milestones

**Decision: house first.** M3 carries every feature the partner uses with
her own students as the house teacher, and all of it lands **before**
OPS-020, the cohort dry run, which grows to exercise it. M4 makes it
multi-teacher: seats, freeze, grants, promotion, attribution and the legal
decision. PROG-004 moves from M4 to M3. The Telegram reminders
(COH-010..013) and this session's Telegram pings move to the bottom of M4;
ANON-018, AUTH-019 and SHELL-024 stay in M3.

### 22. Epic

A new `TCH` epic: teachers — seats, student links, groups, messages,
homework.

## What this changes in docs/handoff.md

A third line next to the free mini-courses and the cohort courses; M3's bar
grows; M4 gains multi-teacher; "One author today" is no longer the plan;
individual answers reach a linked teacher. Homework due dates and the
calendar do not lock anything, so "No locks and no forced order" stands.

## Build cards

M3, ranked before OPS-020: VOICE-008, PROG-004 (moved), PROG-005, OPS-024,
TCH-001 … TCH-006, COH-014 … COH-016; OPS-020 depends on all of them.

M4: OPS-025 (decision), TCH-007 … TCH-011; then, at the bottom, COH-010 …
COH-013 (moved), TCH-012, TCH-013.

## Revisit if

- A teacher needs self-serve billing: unpark Polar vs Paddle
  (docs/handoff.md, "Payments").
- OPS-025 finds that a teacher must be a separate controller with
  obligations the platform cannot carry; Decisions 6 and 7 may shrink.
- Teachers' students are not Russian-speaking: the English surface's
  RU-first chrome (docs/handoff.md, "Audience and language") was not
  revisited here.
- Inboxes fill with questions from many students: per-question threads
  (Decision 8, option B).
- Learners ask for takes that survive a reload (Decision 11, option B).
