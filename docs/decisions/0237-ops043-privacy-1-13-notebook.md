# 0237 — OPS-043: privacy policy 1.13, the notebook

Status: approved by the owner on 2026-11-25 on the full rendered diff. The text follows 0236
section 8 ("Privacy delta"). Below is what this card added to it or decided unattended.

## Decisions

1. **"May" for the linked teacher.** PROG-020 ships after the text, so the sentence is true both
   before and after. Section 5 also says nobody else sees the notebook.
2. **"Or ask us to".** PROG-012 may copy entries on hosted before PROG-016's delete control
   exists. A promise of self-service deletion would be false in between; an email request is
   already in section 8.
3. **Baseline quotes.** A copied later summary can quote the first take. Replacing the first take,
   or hiding its feedback, removes only the first take's own entries (0235 "When copies go"; the
   key is the summary's own `submission_id`, 0236 section 1). Section 7 says so.
4. **Backfill disclosed.** Section 3.2 says feedback that already exists is copied (0236 section 3).
5. **Legal basis: contract** (0236 section 8). Own notes are listed in 3.1 (data you give us), the
   copies in 3.2 (data created as you use the Service).
6. **Section 12 is unchanged**: no new AI call (0236 section 8). Its "every piece of this feedback
   is labelled" therefore binds the notebook's copies too; see "Not this card".
7. **Passages beyond the card's list**, found by grep: the scope of free-text advice (3.5), the
   teacher legal-basis row (4), what ends with a link (5), and the "nothing reads your attempts"
   contrast paragraph (9).
8. **Notice: none** (0095): production still has only test accounts (owner, 2026-11-24, asked
   again and confirmed 2026-11-25).

## Drafted link-statement bullets (PROG-020 ships them)

Notebook:

- EN: "see the phrases, corrections and AI summaries your notebook copied from your recordings in
  those lessons and courses (a summary that compares two recordings only if both are in them), but
  never the notes you write yourself"
- RU: «видеть фразы, исправления и ИИ-разборы, которые ваш блокнот сохранил из ваших записей в этих
  уроках и курсах (разбор, где сравниваются две записи, — только если обе записи из них), но не ваши
  собственные заметки»

Written answers:

- EN: "read the written answers you send for those lessons and courses"
- RU: «читать письменные ответы, которые вы отправляете по этим урокам и курсам»

"Those" refers to the first bullet, so both follow it directly, above "write to you…".

## Not this card

- PROG-014 and PROG-020 must label the copied text as AI feedback (section 12).
- The statement's `leave` line and `/my`'s `teachersLead` / `leaveConfirm` name answers and scores
  only. PROG-020 already checks the `/my` copy.
- PROG-018, if it ships, changes section 3.4.

## What would make us revisit this

- Real accounts exist when this is published: 0095's notice is owed.
- PROG-012, 016, 018 or 020 ships something different from this text.
