# 0240 — PROG-014: the notebook page

Status: built 2026-11-25 (#331), `/my/notebook`. It implements 0235's page over 0239's model. No migration.
Below is what the card left open and was decided unattended.

## Decisions

1. **The reads are in `lib/notebookData.ts`, outside `lib/notebook/`.** That folder has a test that it imports
   nothing outside itself. Every read is under the learner's session and strict: a fallback would show a
   shorter notebook or a lower number as the learner's record. `VOICE_ANALYSIS_MODE` is not read.
2. **Two filters beyond RLS,** for a learner who also edits a course: takes by `user_id`, and lessons with a
   published version only. The document is embedded by `published_version_id`, so a draft is never a list's source.
3. **"Listen in the lesson" needs the lesson's content,** not only its row (`openLessonHref`). A paid lesson's
   row is listed to everyone, and nothing plays there. A row's source line keeps the wider `rowSource` link:
   that lesson page says how to get in. A take whose audio is deleted has no link.
4. **A take past its date and not yet purged** reads "The audio will be deleted soon". A cohort take whose run
   cannot be read shows no date (0239 Decision 7).
5. **Dates.** Kept-until is the UTC date of the purge moment; the sent time is `LocalDateTime`, as on `/my`.
6. **The record hides only when the notebook is empty and every number is zero** (0239 Decision 4).
7. **Reused strings.** The AI disclaimer and the recording kinds are `/my`'s own (`myCopy`).
8. **Copied text carries `lang="en"`;** an own note does not, since its language is not known.
9. **Tab and chip links do not prefetch:** each would be a server render of the whole page.
10. **Fixture.** `scripts/seed-local-fixtures.ts` gives `prog007-learner` an own note and a course
    (`prog014-fixture`) with one open and one paid lesson, each with a phrase list.

## Measured

Local stack, one build each, `next start`. `npm run budget` before and after, `VOICE_ANALYSIS_MODE=on`: `/my`
175.2 and 175.2 KB (limits 180, 182) both times; `/my/notebook` 166.5 KB of 180; every other route identical.

Browser run (Edge, `VOICE_ANALYSIS_MODE=off`): 42 checks, 0 failures.

- Signed out: 307 to `/login?next=%2Fmy%2Fnotebook`.
- To try: the paid lesson's phrase is stored (1 version) and not on the page, while the open lesson's two are.
  With an entitlement grant the same phrase appears; with the grant removed it is gone.
- As an editor of a course whose takes RLS shows (4 of another learner's): no recordings on the page.
- 360/360 in every state: each tab, a filter with rows, a filter with an empty tab, a tab empty everywhere, To
  try empty, recordings open, empty notebook, 150-character unbroken words, junk and repeated parameters, RU in
  six of these, dark. 1280/1280 light and dark. `npm run viewport360 --expect`: 360/360 for Phrases (EN) and To try (RU).

The budget and browser figures are of the final code. With the mode off, `/runs/…f1a1` prints 182.0 KB of 179 (172.3 with
it on, which its entry is measured with); this card does not touch that route, and why it is larger was not looked into.

Not measured: a phone, a screen reader, an archived or
unpublished lesson's rows in a browser (unit-tested in `lib/notebook`), hosted.

## What would make us revisit this

- A learner has more than 1,000 lessons or takes in scope: PostgREST would cut those two reads silently.
- The per-course completion calls are slow for a learner with many started courses (one RPC each).
- Learners ask to open the lesson from a recording whose audio is gone.
