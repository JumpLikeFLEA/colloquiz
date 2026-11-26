# 0243 — PROG-019: downloading a recording, and the notebook as a file

Status: built 2026-11-26 (#334). No migration, no new dependency, no AI call. Settled inputs: 0235
"Playback and downloads" and decision 9, 0236 section 8 (the text file's format).

## Decisions

1. **The recording route checks the owner twice before it signs**
   (`app/api/voice/submissions/[id]/download/route.ts`): the row is read with `user_id` = the caller,
   and `decideRecordingDownload` (`lib/voice/download.ts`) re-checks it. RLS alone is not enough: an
   editor of the course reads the row and the bucket lets them sign it (060). Anyone but the owner
   gets the same 404 as no take, so the answer never says the take exists; the owner's purged take is
   410; signed out is 401.
2. **The route redirects (303) to a 60-second signed URL with a `download` file name**, under the
   caller's own session, so the bucket policy still applies on top. A plain `<a>` reaches it: no client
   JS. 60 s, not playback's 15 min: the URL is used at once, and a shorter one is worth less if copied.
3. **File name `alina-cher-recording-YYYY-MM-DD-HHMM.<ext>`, UTC, ASCII only**, so no header encoding
   is involved. A course or lesson title would need another read and non-ASCII handling for little.
   Two takes in the same minute share a name; the browser numbers the second.
4. **The format is stated as text beside the link** ("WEBM file" / "файл WEBM"), from the stored
   `content_type` (`recordingFormat`); an unknown type reads "audio file". No claim about which devices
   play it: 0097 left phones, Safari and in-app browsers untested.
5. **The download sits on each recording row whose audio is kept**, beside "Listen in the lesson". A
   purged row has no link (the route would answer 410).
6. **The notebook file** (`/api/notebook/download`, `lib/notebook/textFile.ts`) follows 0236 section 8,
   with these readings of what it left open:
   - the heading is **SUMMARIES** / **РАЗБОРЫ**, plural, because every summary is listed (the sample
     showed one, as "SUMMARY");
   - phrases are merged as the Phrases tab merges them (`phraseRows`), so the file and the page list the
     same rows; the export (0236) stays unmerged;
   - inside a course, rows run oldest first, like the courses; own notes with no course come last under
     "Not from a course" / "Не из курса"; a course's heading is its newest row's title snapshot;
   - a summary with no text and no goal or next step is left out, as on the page (`toCard`);
   - each summary carries the AI line, in the saved language (privacy section 12: copies are labelled).
   The route takes no input; `my_notebook()` under the caller's session decides the rows.
7. **The top-bar icon** is a `Download` link before "← My courses", through a new `action` slot on
   `BandTopBar` that crowds like the toggle (the back link shows only its arrow below `sm` when the chip
   is there too). The accessible name is "Download notebook (.txt)".

## Tested

- `lib/notebook/textFile.test.ts` (5): every kind in 0236's format; Cyrillic headings and an own note,
  with the BOM's three bytes and a UTF-8 round trip; empty sections left out; a phrase in two takes
  merged; the file name.
- `lib/voice/download.test.ts` (6): each container, an unknown type, the file name, owner vs anyone
  else (even with the row in hand), purged for the owner vs someone else.

## Measured

Local stack, `next build` + `next start`, Edge, the `prog007-learner` fixture and four scratch users
(deleted afterwards).

- Recording `f0070000-…b1` (the owner's), each caller, playback route beside the download route:
  owner playback 200, download 303 to a signed URL answering 200 `audio/webm`, `attachment;
  filename=alina-cher-recording-2026-10-22-1327.webm`; an editor of the course playback **200**,
  download 404; a linked teacher (not an editor) 404 / 404; another learner 404 / 404; signed out
  401 / 401.
- Purged take (`b2` set to `object_name NULL, purged_at now()`, restored after): owner 410
  `{"ok":false,"error":"removed"}` beside their kept `b1` 303; the editor 404 on both.
- Notebook file: owner 200, `text/plain; charset=utf-8`, `attachment;
  filename="alina-cher-notebook-2026-11-26.txt"`, first bytes `ef bb bf`, EN and RU headings, a
  seeded Cyrillic own note intact; another learner 200 with none of the owner's rows; signed out 401.
- 360px (`npm run viewport360`): `/my/notebook` 360/360 EN, RU and empty. With Recordings open
  (Edge): 2 download links, "WEBM file" / "файл WEBM", icon 44x44, 360/360 and 1280/1280, EN and RU.
- `npm run budget` (local stack), before (HEAD, changes stashed) and after: `/my/notebook` 169.3 /
  169.3 KB of 180; every other route identical (`/runs/…f1a1` 182.0 of 179 both times, over before
  this card).

## What would make us revisit this

- A device that records in a container not in `VOICE_MIME_TYPES` (VOICE-007).
- Learners asking for the lesson's name in the recording's file name.
- A notebook large enough that one synchronous file is slow (0236 measured 2,002 rows at 0.8 ms).
