# 0111 — VOICE-005: the recorder and feedback in the lesson player

Status: **decided unattended** (VOICE-005 ran `--no-approval`). Each
decision fills a gap that the card, 0097, 0100 or 0110 leaves open. None
changes a rule those files state. No migration: everything here reads and
writes through 060 as it stands.

## Context

The learner records a voice task, listens, re-records and sends; the
partner's feedback appears under the recording (#161). 0110 built the
storage, the submit RPC and the routes. 0097 measured two desktop browsers
and left the bitrate, the in-app fallback and the content type to the
recorder.

## Decision 1 — the voice block is its own chunk, strings included

`LessonPlayer` loads `blocks/VoiceTaskBlock` with `next/dynamic`, and the
recorder, `FeedbackContentView` and the voice strings
(`lib/alliengll/voiceCopy.ts`) are static imports of that module. So a
lesson without a voice task downloads none of it.

The strings left `lib/alliengll/copy.ts` because copy.ts ships with every
lesson, and `/courses/future-imperfect/true-or-false` was at 259.8 of its
260 KB before this card (`npm run budget`, clean tree). Measured after:
259.5 KB (the VOICE-003 placeholder moved out of the main chunk with it);
`applied-practice` 287.3 KB before and after; every other route unchanged.

## Decision 2 — "can send" is a hint from the learner's enrolments; the RPC decides

The page has to choose which controls to draw before anything is sent. It
reads the learner's own non-revoked `run_enrolments` in the course (058's
owner read) and offers Send when there is one (`lib/voiceTaskContext.ts`).
Everyone else, anonymous, signed in without an enrolment, or holding a
grant (0110 Decision 2), gets local-only practice.

This is not an entitlement decision. Nothing is served on it: the lesson's
content is already decided by `lesson_state`, and the send is a write that
`submit_voice_recording` checks in full. If the two disagree, the cost is a
refused send, and the recorder drops to practice with a sentence saying so
(`submitOutcome` in `lib/voice/recorder.ts`). The one known disagreement:
the mirror does not check that the lesson is open THROUGH the enrolment's
run, so a learner who holds both a grant and an enrolment whose week has
not opened sees Send and is refused.

Options considered: a SQL read function returning "can submit" with the
same clauses as the RPC. Rejected for this card: it is a migration (a
`--no-approval` stop) for a disagreement that leaks nothing.

**Revisit** if a real learner hits the refusal, or the next migration that
touches 060 can add the read function at no extra cost.

## Decision 3 — the current enrolment's take only

The learner's takes are read under their own session (060's RLS) and only
those of the current enrolment are shown: the latest-starting run, then the
latest enrolment, the RPC's own order. A take from an earlier run is not
shown, because the next send files under the current run's slot; showing
the old take, perhaps locked by its feedback, would block a send the RPC
accepts. Tested in `lib/voice/taskContext.test.ts`.

A purged take (060: `object_name` NULL) shows "This recording was removed
after the course ended." A feedback body that doesn't parse as
`FeedbackContent` is logged and not shown, never rendered raw.

## Decision 4 — upload straight to Storage with XHR; one id per take

The take goes to Supabase Storage under the learner's own session, not
through a Next route: a take may be up to 10 MiB (0110 Decision 1), above
what a Vercel function accepts as a body. It uses `XMLHttpRequest` because
only XHR reports upload progress (the card's "with progress").

The submission id is chosen when the take is recorded and kept across
retries. A retry after a lost answer finds its own upload (Storage's
"already exists", handled in `isDuplicateUpload`) or its own submission
(`duplicate_submission`, treated as sent) instead of creating a second
object. The browser Supabase client is imported only on Send.

## Decision 5 — the content type comes from the bytes

0097: Firefox 157 reported an empty MIME on both the recorder and the blob.
`resolveUploadMime` reads the container from the first bytes (WebM's EBML
magic, `OggS`, `ftyp`), then falls back to what the blob or the recorder
said, then to what was requested. A take in no accepted container can be
listened to but not sent ("Try Chrome or Safari").

Measured in this card: Playwright's Firefox 141 build recorded WebM, and
the stored object's type was `audio/webm`. Whether desktop Firefox 157
produces WebM or Ogg is still not established.

## Decision 6 — 32 kbps, the block's own limit, and the in-app fallback

- `audioBitsPerSecond` is 32000, requested explicitly (0097,
  "Bitrate"). Measured: Chrome 155, a 3 s take, 10,911 bytes (~29 kbps).
- Recording stops itself at the block's `maxSeconds` and says so.
- The fallback is feature detection, never a user-agent sniff: no
  `getUserMedia` or no `MediaRecorder` shows "Recording doesn't work in
  this browser. Open this page in Safari or Chrome." with a Copy link
  button. A denied permission gets its own sentence and Record stays
  available.

## Decision 7 — the microphone header covers the lesson route only

`next.config.ts` adds a rule for
`/courses/:courseSlug/:lessonSlug((?!opengraph-image$)[^/]+)` that sends
`microphone=(self)`. It overrides the global `microphone=()` because the
later rule wins for the same key (Next headers docs). The course page
(one segment) and its og:image route are not matched. The admin preview
and the demo keep the placeholder with a disabled Record button: the
microphone is blocked there, so a live recorder would only fail.

## Decision 8 — expired playback URLs are re-signed on demand

The page signs each take's URL at render (15 minutes, 0110 Decision 5).
If the audio element errors, the recorder asks
`GET /api/voice/submissions/<id>/playback` once, which re-signs under the
caller's session; RLS answers 404 for anyone but the owner and the course's
editors. A take sent in this visit plays from its local blob URL.

## Observed, not fixed

- A Firefox-recorded WebM reports `duration` `Infinity` in Firefox (the
  header MediaRecorder writes has no duration). Playback works: currentTime
  advanced 1.17 s in 1.2 s. The native player shows no total length. Chrome
  showed finite durations for its own takes. VOICE-007 judges whether it
  matters on phones.
- The fixture lesson from VOICE-004's protocol (`v4mv2s1qrf-a/w1`) had a
  theory block with `type: "paragraph"`, which the player rejects; it was
  fixed to `prose` on the local stack only.

## Not demonstrated

The card asks for the VOICE-001 devices that passed: desktop Chrome 155
and desktop Firefox 157, both Windows. Chrome 155 is the system browser.
Firefox ran as Playwright's Firefox 141 build, not 157. Both used each
browser's fake microphone, not a real one, so audibility was not judged.
No phone or in-app browser was tested (VOICE-007).
