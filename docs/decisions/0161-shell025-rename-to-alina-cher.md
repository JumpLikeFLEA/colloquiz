# 0161 — SHELL-025: the English surface is called Alina Cher

Status: built. Implements 0156 Decision 11; supersedes 0137 **for the name
only**.

## Context

0137 (2026-10-14) named the English surface "Alliengll". The owner chose
"Alina Cher", tagline "английский с умом", on 2026-10-17 (0156 Decision 11).
This card is the rename; the tagline belongs to the landing redesign
(SHELL-027), not to this card.

## Decisions

1. **Display strings change; internal names stay.** Changed: `siteName` and
   `wordmark` in `lib/alliengll/copy.ts` (the title template, og:site_name,
   the share-card wordmark and alt text and the course/lesson header all read
   them), the landing wordmarks in `landingCopy.ts`, the footer copyright in
   `footerCopy.ts`, the English auth panel heading and mobile logo label in
   `AuthScreen.tsx`, and the calendar feed's name (`X-WR-CALNAME`, a
   subscriber sees it in their calendar app) in `app/api/calendar/[file]/route.ts`.
   Kept: the `lib/alliengll/*` module names, `ATTEMPT_STORAGE_KEY`
   (`alliengll.attempts.v1`: renaming it would orphan every anonymous
   learner's saved attempts), the `041_alliengll_schema.sql` filename, the
   Telegram bot's username and the Instagram handle (external).
2. **Leftovers in `app/` and `lib/`** (`rg Alliengll app lib`), all prose
   about the older name or schema, none shown to a user: the comment in
   `copy.ts` that points at 0137, `app/(colloquiz)/layout.tsx:21`,
   `lib/authoredString.ts:6`, `lib/courseAuthoring.ts:26`,
   `lib/inAppBrowser.ts:5`, `lib/lessons/theoryBlocks.ts:6` and
   `lib/lessons/katexFree.test.ts:82`.
3. **The calendar feed name changes for new subscribers only.** A calendar
   app caches `X-WR-CALNAME`; existing subscribers may keep "Alliengll" until
   they rename it. No data changes.

## Revisit when

- The owner wants the tagline in the title template (SHELL-027 decides).
- An anonymous-attempts key migration is wanted (Decision 1).
