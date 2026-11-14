# 0227 — Add editor: pick an existing author

Ad hoc, 2026-11-14 (owner request).

## Context

The course editor's Editors section (admin only) added an editor by a typed
email only. The admin had to remember the email of a teacher who already holds
an author seat.

## Options

A. A picker of seat holders that fills the email the existing route already
   takes; typed email kept for anyone else. No schema change.
B. Grant by user id (a new RPC beside `grant_course_editor`, 029), so a
   Telegram-only account could be picked too. A schema change.

## Decision

1. A. "Author" means an author-seat holder, read with `author_seats_list()`
   (082), which is admin only, like the section. Seat holders who already edit
   the course are left out. If the read fails, or no seat holder is left, the
   dialog is the old email field alone.
2. A seat whose contact is not an email (a Telegram "@username", 073) is listed
   disabled with "(no email)": `grant_course_editor` looks accounts up by email
   (029). The check is display only; the RPC still decides.
3. "Someone else (type email)" is the default choice, so a new author's path is
   unchanged.

## Revisit when

A Telegram-only teacher needs editing rights on a course (option B), or
non-admin editors are allowed to delegate.
