# 0202 — The microphone policy is sent on every route

Status: built. No migration. Ad hoc, from an owner bug report (2026-10-23). Supersedes 0111
Decision 7.

## Context

Owner report: in Chrome, with the microphone permission left at its default of "Ask", pressing
Record on a voice task showed no permission prompt. Firefox prompted and recorded normally.

0111 Decision 7 sent `microphone=(self)` only on `/courses/<course>/<lesson>` and kept
`microphone=()` everywhere else. A `Permissions-Policy` applies to the document it was delivered
with. A client-side navigation (`next/link`) does not load a new document, so a learner who comes
in from `/`, the course page or `/my` keeps that page's `microphone=()`. Chrome then rejects
`getUserMedia` without asking, and the recorder shows its "Microphone access is blocked" line
(`VoiceRecorder.tsx`, `NotAllowedError`). 0097 and 0111 both loaded the lesson URL directly, so
their tests never went through a soft navigation.

Measured with a scratch Playwright probe (system Edge, a fake microphone, the permission granted,
`next dev` on master `a2b5c67`). It opened `/`, clicked a course, then clicked a lesson:

| step | `featurePolicy.allowsFeature("microphone")` | `getUserMedia` |
|---|---|---|
| `/`, loaded directly | false | NotAllowedError |
| lesson, after a soft navigation | false | NotAllowedError |
| the same lesson, reloaded | true | ok |

The lesson's own response carried `microphone=(self)`; `/` carried `microphone=()`.

Why Firefox behaved differently is an assumption, not measured here: Firefox does not enforce the
`Permissions-Policy` response header, so it never applied `microphone=()` at all.

## Options

1. **`microphone=(self)` on every route.** One header, nothing to keep in sync.
2. **List every English route a learner can soft-navigate from** (`/`, `/courses/*`, `/my/*`,
   `/runs/*`, `/invite/*`, `/join/*`). Moving between root layouts is a full page load, so Colloquiz
   and Studio would not need it. But any new English route that is missed from the list brings the
   bug back, and nothing would catch it.
3. **Make every link into a lesson a full page load** (a plain `<a>`). There are many links (lesson
   rows, Continue, Next lesson, homework, feedback, answer review), and the shortcut that keeps the
   first lesson fast would be lost.
4. **Reload when the policy disallows the microphone**, on Record. `document.featurePolicy` exists
   only in Chromium, the reload throws away the learner's unsent takes, and the fix lives in the
   client.

## Decision

Option 1. `next.config.ts` sends `camera=(), microphone=(self), geolocation=(), browsing-topics=()`
on `/:path*`, and the lesson-only rule is deleted. `(self)` still denies the microphone to any
cross-origin frame (the YouTube embed), and the browser still asks the learner before recording.
What is given up is defence in depth on routes that never record: script running on those routes
could ask for the microphone, but only behind the same prompt.

VOICE-005's acceptance line ("every other route keeps microphone=()") is left as written. This file
records the reversal.

After the change, the same probe gave `allowsFeature` true and `getUserMedia` ok in all three
steps, and `/` returned `microphone=(self)`.

## Revisit if

A page embeds a third-party frame that the microphone must not reach even with a prompt, or a route
that never records turns out to need `microphone=()`. In either case, scope it per route, and test
the soft navigation into a lesson as well as a direct load.
