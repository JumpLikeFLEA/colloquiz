# 0097 — VOICE-001: recording and playback matrix

**Closed by the owner, 2026-10-09, with the matrix incomplete.** Only two
desktop rows were measured (Chrome 155 and Firefox 157, both Windows). Every
other cell is "not tested" and stays so: no phone, no Safari, no in-app
browser, no cross-device playback. The owner judged the main functionality
checked and chose to find the remaining issues with real users, fixing them as
they appear. The acceptance lines asking for the full matrix and a complete
set of recommendations are therefore WAIVED, not met. The recommendations
below rest on the two desktop rows and are provisional.

## Context

VOICE-001 (#147) measures what native `MediaRecorder` does on the devices and
in-app browsers this audience uses, before the voice block (VOICE-003), the
bucket (VOICE-004) and the recorder (VOICE-005) are designed around it. No
transcoding on Vercel, so the playback matrix decides which formats are
acceptable.

The spike page lived on the branch `spike/voice-001` at
`/app/admin/voice-spike` and was never merged. **Disposition: deleted, branch
not merged.** The page is gated on `getCourseAccess()` (admin or any
`course_editors` grant), the same check as `/app/admin/courses`.

Sessions shared with other cards: none. No phone session ran, so OPS-007 and
ANON-010 were not batched with this card.

## Finding 0 — the global Permissions-Policy blocks the microphone

`next.config.ts` (line 66-67 on main when this was found) sends
`Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()`
on every route. By reading the config, this blocks `getUserMedia` everywhere;
it was not exercised on main. The spike branch added a second `headers()` rule
for `/app/admin/voice-spike` only, with `microphone=(self)`.

Measured with `curl -I` against the dev server (signed out, so the spike route
returned the proxy's 307, which carries the config headers):

| route | status | Permissions-Policy |
|---|---|---|
| `/app/admin/voice-spike` | 307 → /login | `camera=(), microphone=(self), geolocation=(), browsing-topics=()` |
| `/courses/future-imperfect/test` (no such lesson) | 404 | `camera=(), microphone=(), geolocation=(), browsing-topics=()` |
| `/` | 200 | `camera=(), microphone=(), geolocation=(), browsing-topics=()` |

One header came back on the spike route, and its value was the override. The
signed-in page printed the same value from its own HEAD request (desktop JSON
below, `permissionsPolicyHeader`). A real lesson route's headers were not
checked.

**VOICE-005 implication.** The lesson route(s) need `microphone=(self)` and
every other route keeps `microphone=()`. This is now an acceptance line on
VOICE-005 (backlog `4dcf0b2`), to be shown with response headers. It is a
`next.config.ts` change on a security header, so VOICE-005 states which lesson
routes it covers.

## Environment (what each printed row means)

- Permission: `getUserMedia({ audio: true })` outcome.
- Present / list: `typeof MediaRecorder` and `isTypeSupported` over the nine
  candidates printed by the page. `isTypeSupported` true means the browser
  claims support; it does not mean a file in that type was produced.
- MIME produced: `MediaRecorder.mimeType` after the take and the blob's type.
- Bitrate: requested `audioBitsPerSecond`, the value the recorder reports, and
  the measured `bytes * 8 / seconds`. "Honoured" means the measured rate is
  near the requested one, not just that the property reads back.
- Lock / switch: the event log across a lock-screen or app-switch mid take.

## Recording matrix

Cells: `not tested` unless a number or event was printed.

| device × browser | getUserMedia | MediaRecorder | isTypeSupported (true) | MIME produced (default) | audioBitsPerSecond honoured | bytes/min | lock / app switch |
|---|---|---|---|---|---|---|---|
| Desktop Chrome 155 (Windows) | granted | present | see below | `audio/webm;codecs=opus` | yes at 64000 and default; see below | see below | tab switch only; see below |
| Desktop Firefox 157 (Windows) | granted | present | webm, webm+opus, ogg+opus | EMPTY (`recorder.mimeType` and blob type both `""`) | yes at 32000 and 48000; see below | 237-338 KB; see below | tab switch only; see below |
| Desktop Safari | not tested | not tested | not tested | not tested | not tested | not tested | not tested |
| iOS Safari | not tested | not tested | not tested | not tested | not tested | not tested | not tested |
| Android Chrome | not tested | not tested | not tested | not tested | not tested | not tested | not tested |
| Instagram in-app, iOS | not tested | not tested | not tested | not tested | not tested | not tested | not tested |
| Instagram in-app, Android | not tested | not tested | not tested | not tested | not tested | not tested | not tested |
| Telegram in-app, iOS | not tested | not tested | not tested | not tested | not tested | not tested | not tested |
| Telegram in-app, Android | not tested | not tested | not tested | not tested | not tested | not tested | not tested |

### Desktop Chrome 155, Windows (owner's machine, real microphone)

`secureContext: true`, `getUserMedia: true`, `mediaRecorder: true`. The UA
string reads "Windows NT 10.0" (Chrome freezes it); the OS version is not taken
from it.

`isTypeSupported`:

| type | result |
|---|---|
| `audio/webm` | true |
| `audio/webm;codecs=opus` | true |
| `audio/ogg;codecs=opus` | false |
| `audio/mp4` | true |
| `audio/mp4;codecs=mp4a.40.2` | true |
| `audio/aac` | false |
| `audio/mpeg` | false |
| `audio/wav` | false |
| `audio/x-m4a` | false |

Takes, copied from the printed report. These ran before the per-device
protocol existed, so they are NOT the protocol's takes: no 60 s take, no 32 or
48 kbps take, and the 64 kbps take is not on the protocol. The protocol takes
for desktop Chrome are not tested.

| take | requested MIME | requested bps | recorder MIME | recorder bps | bytes | wall s | bytes/min | effective kbps |
|---|---|---|---|---|---|---|---|---|
| 1 | default | none | `audio/webm;codecs=opus` | 128000 | 166134 | 10.6 | 939991 | 125.3 |
| 2 | default | none | `audio/webm;codecs=opus` | 128000 | 255006 | 16.2 | 946377 | 126.2 |
| 3 | default | 64000 | `audio/webm;codecs=opus` | 64000 | 109491 | 13.8 | 476072 | 63.5 |

- Default bitrate: the recorder reports 128000 and the measured rates are 125.3
  and 126.2 kbps, about 940 KB per minute.
- Requested 64000: reported 64000, measured 63.5 kbps, 476072 bytes per
  minute. So the request is honoured on this browser.
- The log line `recorder start: mimeType=` is empty on all three takes:
  Chrome reports `mimeType` as empty until data arrives, so the produced MIME
  has to be read after the take, as the page's Takes list does.
- `audio/mp4` is claimed by `isTypeSupported` here, but no take produced it,
  so "Chrome records mp4" is not established. A take with `audio/mp4`
  requested is not tested.

Lock screen / app switch (take 2): the page was hidden from 22:11:14.050 to
22:11:19.795 (5.7 s, a tab switch on desktop) inside the recording.

- The log shows no `pause`, no `error`, no track `mute` or `ended` event
  across it.
- Blob playback duration was 15.780 s against 16.169 s wall (log timestamps,
  start to stop). The wall-minus-duration gap is 0.346 s (take 1), 0.389 s
  (take 2) and 0.361 s (take 3). Take 2's gap is no larger than the takes that
  were never hidden, so there is no sign of lost audio. Whether take 2 sounds
  complete was not checked by ear. This is not a lock-screen test: a desktop
  tab switch is not a screen lock, and the lock-screen cell is not tested.
- The report also holds `visibilitychange` events outside recording
  (22:09-22:10, 22:11:53, 22:12:55), from the owner switching windows.

Playback in the recording browser: `audio play` fired for takes 2 and 3 (none
logged for take 1). The `audio metadata` durations are finite (10.26, 15.78,
13.44 s). A play event does not show the sound was audible, and nobody noted
it; no failure was reported. Download and the file picker were not exercised.

### Desktop Firefox 157, Windows (owner's machine, real microphone)

The UA reads `rv:157.0 Firefox/157.0`. `secureContext`, `getUserMedia` and
`mediaRecorder` all true. The `Permissions-Policy` the page printed was
`camera=(), microphone=(self), geolocation=(), browsing-topics=()`. The report
does not print the host.

`isTypeSupported`:

| type | result |
|---|---|
| `audio/webm` | true |
| `audio/webm;codecs=opus` | true |
| `audio/ogg;codecs=opus` | true |
| `audio/mp4` | false |
| `audio/mp4;codecs=mp4a.40.2` | false |
| `audio/aac` | false |
| `audio/mpeg` | false |
| `audio/wav` | false |
| `audio/x-m4a` | false |

Differs from Chrome 155 on two rows: Firefox claims `audio/ogg;codecs=opus`
and does not claim `audio/mp4`.

Takes (these used the protocol's labels and bitrates but not its durations:
the protocol says 60 s, 30 s and 30 s, and the takes were 9.4, 12.6 and
10.0 s).

| take | requested MIME | requested bps | recorder MIME | blob MIME | recorder bps | bytes | wall s | bytes/min | effective kbps |
|---|---|---|---|---|---|---|---|---|---|
| 1 | default | 32000 | `""` | `""` | 32000 | 37567 | 9.4 | 240121 | 32 |
| 2 | default | 32000 | `""` | `""` | 32000 | 49644 | 12.6 | 237228 | 31.6 |
| 3 | default | 48000 | `""` | `""` | 48000 | 56593 | 10 | 338306 | 45.1 |

- **The produced MIME is not readable in Firefox.** Both `recorder.mimeType`
  and the blob's type are the empty string after stop, on all three takes. So
  an uploader cannot take the content type from the recorder or the blob on
  this browser; it has to set one itself. What container Firefox actually wrote
  was not measured (no file was sniffed or played elsewhere). That it is ogg
  or webm with opus follows from `isTypeSupported` and is a hypothesis.
- Bitrate: 32000 gave 32.0 and 31.6 kbps; 48000 gave 45.1 kbps, about 6%
  under the request on a 10 s sample. Bytes per minute are 240121, 237228 and
  338306, so a minute at 32 kbps is about 240 KB.
- Tab switch (take 2): hidden from 10:38:00.178 to 10:38:01.722 (1.5 s), no
  pause, error, mute or ended event. Wall time minus audio duration was 0.008 s
  (take 1), 0.007 s (take 2) and 0.011 s (take 3), so take 2 shows no loss.
  Unlike Chrome there is no ~0.35 s start offset. This is a desktop tab
  switch, not a screen lock; the lock-screen cell is not tested.
- Playback in the same browser: one `audio play` event, after take 3. Takes 1
  and 2 were not played. Download and the file picker were not exercised.

## Cross-playback matrix

Every produced file played on every device. Only same-device playback has been
exercised so far.

| produced file | plays on: desktop Chrome | desktop Safari | iOS Safari | Android Chrome | partner's phone |
|---|---|---|---|---|---|
| desktop Chrome `audio/webm;codecs=opus` | same device: play event fired (takes 2, 3) | not tested | not tested | not tested | not tested |
| desktop Firefox (type unknown, see above) | not tested | not tested | not tested | not tested | not tested |
| every other device's file | not tested | not tested | not tested | not tested | not tested |

If a download fails inside an in-app browser, that is recorded as a finding and
the playback cells for that phone are covered from its regular browser, flagged
as an assumption on Android.

## Recommendations (provisional, from two desktop rows)

- **Accepted MIME list.** Do not hard-code one. Desktop Chrome produced
  `audio/webm;codecs=opus`. Firefox reports no MIME at all (both
  `recorder.mimeType` and the blob type were empty), so the uploader sets the
  content type itself, from the bytes or from `isTypeSupported`. Safari and
  iOS are not tested, so an mp4/aac list is not established; Chrome claims
  `audio/mp4` but no take produced it. Playback must be proven per container
  in VOICE-007.
- **Bitrate.** Request `audioBitsPerSecond` explicitly. It was honoured on both
  browsers: Chrome 64000 gave 63.5 kbps; Firefox 32000 gave 32.0 and 31.6 kbps
  and 48000 gave 45.1. A start of 32 kbps is about 240 KB per minute (240121
  and 237228 bytes/min measured). Whether 32 kbps is intelligible enough for
  the partner's feedback was not judged; she decides in VOICE-007. The browser
  default is about 940 KB per minute on Chrome, so it must not be left unset.
- **Max duration.** Not measured; a product call. For scale only: 3 minutes at
  32 kbps is about 0.72 MB (3 x 240121 B, derived).
- **Bucket size limit.** Not measured on any phone. It follows from the max
  duration and the bitrate above; set it to a multiple of that product with
  headroom for a browser that ignores the request (unverified on phones).
- **In-app-browser fallback.** Not determined: no in-app browser was tested.
  The recorder must feature-detect `getUserMedia`, `MediaRecorder` and a
  supported type, and offer an "open in your browser" path when any is
  missing. Whether Instagram and Telegram need it is for VOICE-007 to find out.
- **Header.** The global `microphone=()` blocks recording; VOICE-005 scopes
  `microphone=(self)` to the lesson route(s) only (its acceptance, backlog
  `4dcf0b2`).

## Proposed cards

No failure was observed in the tested rows, so none is proposed for a failure.
Findings to carry, as notes on existing cards rather than new ones:

- VOICE-004 / VOICE-005: store and serve the recording with an explicit
  content type; do not rely on `Blob.type` or the recorder (Firefox, empty).
- VOICE-007: it becomes the first phone and in-app-browser test of recording
  and cross-device playback, using the VOICE-001 protocol. The untested cells
  above are its starting list.
- A phone or in-app failure found there becomes a card at that point.

## What would make us revisit

A phone browser that produces a type no other device plays; a bitrate request
that is ignored on a device that matters; recording stopping on lock screen on
a device whose users are most of the audience.
