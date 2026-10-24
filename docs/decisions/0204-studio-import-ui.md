# 0204 — The Studio import pages (CNT-019)

Status: decided unattended under `--no-approval` (2026-10-24), within 0203. Card CNT-019.

## Context

0203 gave an admin-granted author an import pipeline (CNT-018, migration 103) with three routes:
`upload-url`, `POST /api/studio/imports` and `GET /api/studio/imports/<id>`. CNT-019 is the UI on
top of them. Nothing in the pipeline, the routes or the schema changes here.

## Decisions

1. **Three pages, one nav entry.** `/studio/imports` (the caller's own rows, latest 50),
   `/studio/imports/new` (the form) and `/studio/imports/[id]` (steps, then the report). "Import
   from file" sits beside "New course" on `/studio/courses`, and "Imports" follows "Courses" in the
   nav. Both are shown only when `can_import_course()` is true, read once per request
   (`lib/courseImport/access.ts`). The list and form pages 404 without the grant. The page for one
   import is gated by row ownership only (RLS, migration 103), so an author whose grant was withdrawn
   can still read what they ran. The grant is checked again by every route and RPC, so the UI
   decides what to show and nothing else.
2. **Kill switch on the form page.** With `COURSE_IMPORT_MODE` not `on`, `/new` says import is
   switched off instead of showing a form every route would refuse (403). The courses-page link still
   shows, as the card asks for it on the grant alone.
3. **The first paint is the status route's own view.** The page calls `importStatusView` on the row
   it just read, and the client then polls the route every 4 s while the state is `running`. One
   function therefore decides the steps, the counts and the failure sentence, and the page cannot
   disagree with the route. The column list moved to `IMPORT_STATUS_COLUMNS` in `status.ts` so the
   page and the route read the same columns.
4. **Keeping the page open recovers a stalled run.** The poll is what re-claims an expired lease
   (route comment, 0203 Decision 5). The page says so in one line, and says the import carries on if
   the author leaves. The first half is the pipeline's design (the CNT-018 kill run recovered through
   a poll). The second half, that a run continues with the tab closed, follows from the run starting
   in `after()` and was not tested by closing a tab here.
5. **The report is read defensively.** `readStoredQa` turns the stored JSON into `ImportQa` and
   drops anything off-shape rather than throwing; a done import with no readable report says so and
   points to the editor. Notes, flags and conversions render as text, never HTML.
6. **A note about access in the report.** Imported lessons land `entitled` (CNT-018 surprise), and a
   self-paced course needs one lesson open to anyone before it can be published. The report says so
   above the lessons rather than leaving the author to meet the publish refusal. It is not computed
   per course: it is a fact of how every import is written.

## Not done here

- Re-importing into an existing course, a cancel button, image extraction (0203 "Not done here").
- DOCX against the model (CNT-018, owner: PDF only).
- Opening a lesson from the report: the course editor already has the access control.

## Revisit if

- Authors leave the page and imports stall more than the poll recovers (then a cron that
  re-claims, which the sweep does not do today: it only fails rows past 24 h).
- Authors want to cancel an import or retry in place.
