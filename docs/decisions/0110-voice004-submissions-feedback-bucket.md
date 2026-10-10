# 0110 — VOICE-004: submissions, feedback and the voice bucket

Status: **decided unattended** (VOICE-004 ran `--no-approval`). Each
decision fills a gap that the card, 0093, 0095, 0096 or 0097 leaves open.
None of them changes a rule those files state. Built in
`supabase/migrations/060_voice_submissions.sql`. The protocol output is in
#160's closing comment (local stack; 060 applied locally only).

## Context

Learners in a cohort run record a weekly voice task. The partner listens
and answers in writing. A re-send replaces the earlier take until feedback
is published, and then the block locks (owner, 2026-10-07). Recordings are
deleted 6 months after the run ends, or with the account
(privacy-policy.md, "How long we keep it"). The export includes a copy of
them (privacy-policy.md §8). This card is the storage, the SQL and the
server routes. The recorder (VOICE-005) and the review queue (VOICE-006)
build on it.

## Decision 1 — bucket: private, 10 MiB, `audio/webm`, `audio/ogg`, `audio/mp4`

0097 gives no size limit or MIME list. It says to derive both. The limit
covers the longest take a block allows (`VOICE_MAX_SECONDS` = 600 s) at
the 128 kbps Chrome records when no bitrate is requested (0097: 125.3 and
126.2 kbps). That is 600 × 128000 / 8 = 9.6 MB, so the limit is 10 MiB. A
browser that ignores the requested 32 kbps still fits.

The bucket takes bare container types:

- `audio/webm` — produced by Chrome in 0097;
- `audio/ogg` — claimed by Firefox in 0097;
- `audio/mp4` — what Safari records. This is an assumption: no take
  produced it in 0097. VOICE-007 measures it.

Firefox reports an empty MIME for its own recording (0097), so the uploader
sets the type itself.

Measured on the local stack:

- `audio/mpeg` is refused ("mime type audio/mpeg is not supported").
- 10 MiB + 1 byte is refused, and exactly 10 MiB is accepted.

`lib/voice/recording.ts` holds the same numbers. `recording.test.ts` reads
060 and fails if the two disagree.

## Decision 2 — only an enrolled learner can submit, not a grant holder

The card says "entitled with the lesson open". Entitlement has two sources:

- a run enrolment;
- a `course_entitlements` grant (0093 b).

The submit RPC requires a non-revoked enrolment through which the lesson is
open now. If more than one qualifies, the latest run wins.

The reason is retention. Recordings are deleted "6 months after the end of
the run", and a grant has no run, so a grant-held recording would have no
deletion date that the policy describes. The policy also describes
recordings only "for a voice task in a cohort course". A grant holder gets
`not_enrolled`. VOICE-005 shows them the local-only practice recorder, the
same as the free and anonymous context.

Consequence for VOICE-007: its test learners join through invites, not
grants.

**Revisit** if comps or test accounts need to submit. They would then need
a retention rule of their own (for example 6 months after submission), and
the privacy text would change with it.

## Decision 3 — a submission is the current take; feedback hangs off it

`voice_submissions` holds one row per (enrolment, lesson, block): the
current take. A re-send works like this:

- it inserts a new row (new id, new object);
- it deletes the old row;
- it queues the old object for removal;
- it re-inserts any DRAFT feedback against the new take, so the partner's
  unfinished text survives the re-send.

Keeping superseded rows was rejected. Their objects are deleted anyway, and
a row pointing at nothing is noise.

`voice_feedback` has one row per submission. Publishing is one-way: a later
save edits the live text, which is VOICE-006's "the learner sees the latest
version". Unpublishing would unlock the block and let a re-send replace the
take that the feedback answers.

The path rule `{course}/{user}/{submission}.{ext}` means the uploader picks
the submission id (a fresh UUID per take) before uploading. The RPC checks
the object exists under exactly that name and takes the content type from
the stored object's metadata, not from the request.

A take purged at 6 months keeps its row, with `object_name` NULL and
`purged_at` set. That is how COH-005 tells "removed" from "never recorded".

## Decision 4 — when objects are deleted, and by what

No app role has a DELETE policy on the bucket. Every removal goes through
the Storage API with the service role (`lib/voice/storage.ts`), and only
afterwards does `voice_mark_removed` update SQL.

- **A replaced take is deleted when it is replaced.** `POST
  /api/voice/submissions` removes it in the same request, taking the name
  from the RPC's answer, never from the request. Measured locally:
  `replacedRemoved: true`, and the object was gone from the listing.
- If that removal fails, the name stays in `voice_object_deletions`. The
  daily purge removes it at most a day later. Shown: a re-send made
  through the RPC directly, bypassing the route, was purged as `replaced`.
- **6 months after the run ends:** the daily purge.
- **An erased account:** `delete_my_account` lists every object under the
  caller's `{user}` segment, including takes never sent. It queues them
  and returns them. The account-delete route removes them as it does
  avatars. Anything left over goes to the daily purge.
- **An upload no submission references after 24 hours** (a take never sent,
  or one the RPC refused): the daily purge. The submit route never deletes
  a name taken from the request, so a crafted request cannot delete
  someone's live take.

The purge mechanism is a **Vercel Cron job** (`vercel.json`, daily 03:41
UTC) calling `GET /api/cron/voice-purge` with `Authorization: Bearer
$CRON_SECRET`. pg_cron (033 and 059's mechanism) was rejected: it can't
call the Storage API without `pg_net` and a service-role key stored in the
database.

The route refuses every request when `CRON_SECRET` is unset. **The owner
must set `CRON_SECRET` on the Vercel project, or nothing is purged.**

## Decision 5 — signed URLs live 15 minutes

`VOICE_SIGNED_URL_TTL_SECONDS` is 900 s. That is longer than the longest
take, so playback started on a fresh URL can finish, and short enough that
a copied link soon stops working (0109 Decision 13: no download). URLs are
signed under the caller's own session, so the bucket's SELECT policy
decides who gets one: the owner and editors of the course.

Measured: a 3 s URL returned 200 at once, and 400 `InvalidJWT` ("exp" claim
timestamp check failed) after 5 s. A player that sits idle past the TTL
signs a new URL (VOICE-005 / 006).

## Decision 6 — the export embeds the audio

The privacy text says "The export includes a copy of your voice
recordings", so the export does more than list them. Each take carries
`audio_base64`, downloaded under the learner's own session. A removed take
has `removed_at` and no audio. Feedback appears only once published: the
learner's RLS never returns a draft. `EXPORT_FORMAT_VERSION` 6 → 7.

**Hypothesis, not measured:** Vercel limits a non-streamed function
response to 4.5 MB. A learner with several long takes could exceed that
(six 3-minute takes at 32 kbps ≈ 4.3 MB raw, ≈ 5.8 MB in base64). Tested
locally with 2 KB takes only. If it bites, the fix is a streamed response
or a zip, as its own card.

## Decision 7 — CSP

The report-only CSP gains `media-src 'self' blob: <supabase origin>`:

- the Supabase origin serves signed playback;
- `blob:` covers the recorder's listen-back before sending (VOICE-005).

Without it, media falls back to `default-src 'self'`. `connect-src`
already allows the Supabase origin, which covers the upload. Printed from
the local dev server: `media-src 'self' blob: http://127.0.0.1:54321`.

## Not in this card

- **The final comment (COH-005).** VOICE-006 writes it and COH-005 shows
  it, but neither card's acceptance creates its storage. Proposed as a
  card.
- **The before/after slot in SQL.** 0100 Decision 3 left the compare-slot
  uniqueness in the publish route, to revisit "if the submit RPC keys the
  before/after pair by slot". It does not: submissions are keyed by
  (enrolment, lesson, block). COH-005 reads the slot from the published
  document, so 0100 Decision 3 stands.

## What would make us revisit this

- VOICE-007 finds a phone that records a type outside the list, or takes
  over 10 MiB.
- The export hits the response-size limit (Decision 6).
- Comps or test accounts need to submit (Decision 2).
- The partner wants to un-publish feedback. That would mean unlocking the
  block, which the owner ruled out.
