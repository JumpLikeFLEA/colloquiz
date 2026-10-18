# 0170 — OPS-025: teacher terms and data roles

Status: decided by the owner 2026-10-18 (answers 1-3 below). Gates onboarding
the first external teacher, not building. No text on /terms or /privacy
changed in this card; the proposed delta is in "Terms and privacy check" and
needs the owner's sign-off and a version bump (0083) in its own commit.

## Context

docs/decisions/0141 gives a linked teacher every attempt with its answer and
score (D6), stores every signed-in answer (D7) and left controller or
processor to this card (D19). The live policy (1.5) names the platform
operator as the sole controller (`privacy-policy.md` line 26), puts a linked
teacher's access under contract (§4, line 170) and describes a "teacher" as a
course author the learner chose to link to (§5, line 197). Nothing in it says
what a teacher may do with what they see, or what happens on a complaint.

## Options

| | A. Platform sole controller, teachers as authorised users | B. Teacher controller, platform processor (DPA) | C. Joint control (Art. 26) |
|---|---|---|---|
| Teacher signs | Teacher terms | Terms plus a DPA and their own controller duties | Joint-controller arrangement |
| Student policy | As now, plus the line below | A second notice from the teacher | Roles and contact point |
| 0141 D6/D7 | Unchanged | D6 becomes the teacher's choice; D7 splits | Unchanged, shared purposes |
| Export/deletion | Unchanged (policy §8, §9) | On the teacher's instruction | Either party receives requests |

## Decision (owner, 2026-10-18)

**1. Option A: the platform is the sole controller.** The line is the app's
edge. Inside the service we are responsible for everything, including what a
linked teacher sees and does there. The teacher's own relationship with the
student outside the app (their lessons, payment through Patreon or similar,
contact details the student gives them directly) is the teacher's own
responsibility.

**2. Off-platform contact is allowed, with limits.** A teacher may use what
they see in the service to teach that student, in the app or in their own
lessons outside it. They may not export it or copy it into their own files or
systems, share it with anyone else, use it for marketing or for anything other
than teaching that student, or keep using it after the link ends.

**3. Complaints: minimal.** No in-app report button. Reports go to
privacy@colloquiz.app. An admin reviews and can freeze the seat at once
(TCH-008, 0155). Misuse of student data by a teacher is treated as a personal
data breach (runbook below).

### Runbook: a teacher has misused student data

1. A report arrives at privacy@colloquiz.app. An admin freezes the seat at
   once if the report is credible (`/studio/authors`, "Freeze now").
2. Assess it as a personal data breach: which students, which data, what was
   done with it.
3. Notify the relevant supervisory authority within 72 hours of becoming
   aware, unless the breach is unlikely to result in a risk to the students
   (GDPR Art. 33).
4. Tell the affected students if the risk is high (Art. 34).
5. Record the assessment and the outcome. Whether to end the seat is the
   owner's call.

This is a procedure, not a feature. Nothing in the app changes.

## Consequences

- 0141 D6 and D7 stand unchanged; no DPA, no second notice, no change to
  export or deletion.
- The seat's expiry (TCH-007/008) and the link's end already stop a teacher's
  access in the app. What the teacher does with what they saw before is
  governed by the terms, not by the app.
- Draft teacher terms: `docs/release/teacher-terms-draft.md`, for the owner.
  The first external teacher accepts them before getting a seat.
- docs/handoff.md gains a paragraph under "A third line".

## Terms and privacy check

Read against Terms 1.2 and Privacy 1.5, 2026-10-18:

- Terms: no mention of teachers. Terms §4 says paid courses are sold by their
  author through Patreon or similar, which already matches the
  outside-the-app boundary. Nothing contradicts A.
- Privacy §4 (line 170, contract), §5 (lines 197-202), §9: consistent with A.
  Line 202 says a link ending removes the teacher's access, which is the same
  event as decision 2's "after the link ends".
- Gap: no text tells a student that what a teacher does outside the app is the
  teacher's own responsibility, or that the teacher may not copy or share what
  they see. Proposed addition at the end of §5 "Teachers you link to":

  > Inside Colloquiz we are responsible for what a teacher can see and do.
  > What a teacher does outside Colloquiz (their own lessons, payment through
  > another service, details you give them directly) is the teacher's own
  > responsibility. Teachers agree to use what they see here only to teach
  > you, not to copy or share it, and to stop when the link ends. To report a
  > teacher, email privacy@colloquiz.app.

  This is a student-facing addition, so it takes a minor version bump and the
  0095/0144 notice question. Not applied here.
- Line 331 (72-hour breach sentence) already covers decision 3; no change.
- Subprocessors: unchanged (no new processor).

## Revisit if

- A teacher or school creates student accounts or uploads student lists.
- A teacher asks for a DPA.
- A teacher asks for, or gets, an export of student data.

Any of these makes the teacher a de facto controller; reopen Options B and C.
