# 0144 — OPS-024: legal text for the house-teacher features

Status: signed off by the owner 2026-10-16. Privacy 1.5 and Terms 1.2 (both
2026-10-16), with migration 072 (written, not applied: it must be applied
before the deploy that publishes Terms 1.2).

## Context

docs/decisions/0141 stores every signed-in answer (D7), lets a linked teacher
read answers and scores (D6, superseding 0109 D8 for linked students), and
adds messages with snapshots (D8, D10), private groups (D12), homework (D13),
custom events and a calendar feed token (D15, D16). The live policy (1.4)
says an author never sees an individual learner's score
(`privacy-policy.md`, §5 "Course authors") and lists no answers, links,
messages, groups, homework or feed token. The cards that ship these
(PROG-005, TCH-001..006, COH-014..016) each say "the live legal text
describes what this card does; if it doesn't, stop and ask".

## Draft: what privacy 1.5 says (per item)

| Item | Who reads it | Basis | Leaving a link | Account deletion |
|---|---|---|---|---|
| Stored answers (all signed-in learners) | the learner; linked teachers, on their courses and on the lessons and courses assigned | Contract; legitimate interests as fallback (below) | answers kept; teacher loses access | deleted outright |
| Teacher link | the learner, the teacher | Contract | the link itself | deleted |
| Messages, with attached snapshot/answer | the learner, the teacher | Contract | conversation stays readable to both, closed; attachments stay | whole conversation deleted, both sides (Q4) |
| Private groups | the teacher; the learner sees the name only in their data export (Q2) | Contract | learner removed from the teacher's groups | removed |
| Homework | the learner, the teacher | Contract | no new homework from that teacher | removed |
| Custom events | run enrolees / group members; contain nothing about the learner | n/a (no personal data of the learner) | n/a | n/a |
| Calendar feed token | the learner; stored hashed | Contract (own row in §4) | n/a (a learner action, not a link) | deleted |

Sections touched: 3.1, 3.2, 4, 5 (new "Teachers you link to" and "Dates
and the calendar feed"; the "never the score of an individual learner" clause
now excepts linked teachers), 7, 8 (export), 9 (deletion list and the
"nothing else reads your attempts" sentence, which was false for a linked
teacher).

**Basis, in three rows of §4 (split on owner instruction).** Stored answers,
the teacher relationship and the calendar feed each have their own row; the
teacher row's wording ("the relationship you asked for by linking") no longer
covers the other two.

**Stored answers: contract, with legitimate interests as the fallback.**
Contract rests on Terms 1.2 §4, which now says: "Colloquiz also offers short
English courses: lessons with practice exercises that are scored as you go.
While you are signed in, your answers and scores are saved to your account as
part of your progress." (Owner added the line in the same 1.2 bump; no new
migration.) Legitimate interests with an objection right (§8) stays as the
stated fallback in the privacy policy's §4 row.

**Teacher relationship: contract, not consent.** A link made by claiming a run invite is a
step to join a course the learner chose, so consent to it would not be freely
given (TCH-001 shows the same statement before "Join the course"). The
statement shown before linking is transparency, not the legal basis. Leaving
is offered either way.

## §13 materiality (the 0095 precedent)

Material, in two parts:

1. **Reverses an explicit promise** (§5, "never the score of an individual
   learner"), for linked students only. It takes effect only after the
   learner's own act of linking, behind a statement of what the teacher sees.
2. **New data category for everyone:** answers stored for every signed-in
   learner (PROG-005), regardless of any link. 0095's table treats a new
   category as material.

Not retroactive: `response` is a nullable column, so no existing attempt
gains an answer; the earlier rows stay score-only.

## Notice route (0095 Decision 1)

- **Owner, 2026-10-16 (Q1): no real accounts exist.** 1.5 ships with no
  notice, as 0095. The text is written conditionally ("if you link…").
- **Not taken, kept for later (if real accounts exist before PROG-005
  ships):** an in-app banner (Option A) before PROG-005
  takes effect, naming stored answers and, for TCH-001 onward, the link.
  **No banner mechanism exists in the code** (`rg` over app/, lib/, docs/
  decisions/ finds none), so this is a new card, not a text change.
  Privacy §13 sets no minimum period. Terms §10 sets 14 days, but only if the
  Terms change materially (see below).
- The owner's statement is the only evidence for "none"; I did not probe
  production.

## Terms and subprocessors

- **subprocessors.md: none.** Every new item is stored in Supabase and served
  by Vercel, both already listed. The calendar feed makes the learner's own
  calendar app fetch their dates at their request; that app is the learner's
  provider, not ours. Telegram pings are TCH-012 (M4) and will need their own
  row then (the bot is already a Telegram use).
- **terms-of-service.md: 1.2, the §5 bullet only.** "harass, spam or abuse
  other users through groups, duels, shared quizzes, feedback or messages".
  The §4 "Teachers" paragraph was declined; the English-courses paragraph in §4 was added instead (see stored answers below). Not material (a conduct rule
  widened, nothing taken away), so no 14-day notice under Terms §10.
  Migration `072_terms_1_2.sql` redefines `current_terms_version()` to '1.2'
  (0095 D4); **written, not applied**: the owner applies it. Before launch
  and with no real accounts nobody is stamped against the wrong version, but
  it should be applied before the next signup that matters.

## Owner answers (2026-10-16)

1. **Real accounts: none.** Ship 1.5 with no notice, as 0095.
2. **Group names stay in the export.** §5 now reads "not shown to you in the
   app (they are included in your data export)". TCH-002 gains: wherever
   Studio names a group, a muted line tells the teacher that students see
   group names in their data export.
3. **Terms 1.2: the §5 bullet, and a §4 paragraph on the English courses and saved answers** (added later, same bump), plus migration 072.
4. **Account deletion removes the whole conversation, both sides, with its
   attachments.** TCH-004's acceptance reworded from "removes the learner's
   messages" to that; privacy §9 matches.
5. **Assigned scope (owner, same pass).** A teacher who assigns one lesson
   sees answers for that lesson only, not its whole course. Privacy §5 says
   "lessons and courses they assigned you"; TCH-005's reader line (and
   TCH-003's goal) match.

Issue bodies for TCH-002, TCH-003, TCH-004 and TCH-005 still carry the old
acceptance text; `backlog.mjs` is updated, and the bodies are reconciled by
the owner running `bootstrap-board.mjs` (I did not, per CLAUDE.md).

## Not decided here

- Controller or processor for external teachers, and a teacher whose seat
  lapses: do they keep read access to linked students' answers while frozen?
  OPS-025 (M4) and TCH-007. 1.5 describes the house teacher only in
  practice, but its wording ("a course author you choose to link to") covers
  all teachers; OPS-025 gates the first external one.
- Russian text for the link statement (0095 "Open", unchanged).

## What would make us revisit this

- A teacher feature stores or shows something 1.5 does not list.
- PROG-005's size cap drops answers (the text says answers are stored; a
  dropped over-long response is stored as nothing, which is less, not more).
- OPS-025 concludes teachers are separate controllers.
