# 0094 — CNT-011: lesson access levels and the sign-in prompt

Status: **DECIDED (owner, 2026-10-08).** Settled input 6
(`prompts/m3-cohort-backlog.md`) says the two conflicts are settled on this
card and nowhere else. The options below are kept as the record; each
decision ends with an **Owner's answer** paragraph, which overrides any
"Recommendation" wording above it.

## Context

`lessons.in_free_sample BOOLEAN NOT NULL DEFAULT FALSE` (041:117) has one job:
is the lesson in the free sample. `can_read_lesson` (044:139) grants a
non-editor read through three branches: editor; published + not archived +
`in_free_sample`; entitled. The partner wants a third state, "open after
sign-in" (`docs/handoff.md`, "Partner answers", sign-in on free courses).

Consumers of the boolean today (re-derived with `rg`, not remembered):
`lib/coursePage.ts:84`, `lib/coursePageProgress.ts:30,97` (`firstFreeLesson`,
`allFree`), `lib/courseAuthoring.ts:153`, `courses/[courseSlug]/page.tsx:131`,
`CourseDetailView.tsx:329,413`, `free-sample/route.ts`, `create_lesson`
(046:111), `set_lesson_free_sample` (041:437), `scripts/import-lesson.ts:352`
(omits the column, so it takes the default).

## Decision 1 — column and value names, mapping

**Recommendation:** `lessons.access_level TEXT NOT NULL DEFAULT 'entitled'
CHECK (access_level IN ('anyone', 'signed_in', 'entitled'))`.

- Values name an *audience*, not a lock state. The column comment says it
  answers one question: who may open this lesson. The cohort week (COH-002)
  is a separate column and a separate branch; "free sample" means
  `access_level = 'anyone'`.
- Mapping: `in_free_sample = true → 'anyone'`, `false → 'entitled'`. Default
  `'entitled'` equals today's `DEFAULT FALSE`, so `import-lesson.ts` needs no
  change.
- CNT-012 adds the column, backfills, and switches `can_read_lesson` and the
  policies to it in the same migration. `in_free_sample` stays in the table,
  unread, until CNT-014 has moved the readers; a later migration drops it.
  No dual-write: `set_lesson_free_sample` is replaced in the same migration,
  so the two columns cannot diverge.
- Alternatives considered: `access` (rejected in 041:79 as lock-sounding);
  `audience` (accurate, but reads oddly beside `status`).

**`create_lesson`:** the first lesson of a course is `'anyone'`, every later
one `'entitled'` — today's behaviour (046:111) in new words. Consequence: a
new course satisfies Decision 2's publish check by default. `'signed_in'` is
only ever a deliberate author action.

**Owner's answer (Decision 1):** as recommended. Amended by Decision 2: the
first-lesson default applies to self-paced courses only.

**`set_lesson_free_sample` and its route:** replaced by
`set_lesson_access_level(p_lesson_id, p_level)` (same `can_edit_course` check,
same SECURITY DEFINER shape, still separate from save and publish per 0018
Decision 4) and `.../lessons/[lessonId]/access-level/route.ts` taking
`{ accessLevel }`. The old RPC and route are deleted in CNT-014/AUTH-009, not
left as aliases. The new RPC refuses a change that would leave a *published*
course with no `'anyone'` lesson (Decision 2).

## Decision 2 — Conflict 1: a sign-in wall vs "no signup wall"

Evidence on what a wall costs today:

- `lib/inAppBrowser.ts`: a user-agent containing `Instagram` or `Telegram`
  hides the OAuth buttons (0068 D7). Inside the two browsers the audience
  arrives from, only email + password is offered. This is a substring check,
  **not verified on a device**; the on-device pass is OPS-007, currently in
  Hold.
- Email signup confirms in another browser: the link opens in the system
  browser or mail app, not the in-app one. The PKCE `code` flow only works in
  the browser that started signup; the `token_hash` flow works across
  browsers but needs the hosted "Confirm signup" template to contain
  `next={{ .RedirectTo }}` (0068 D3, D5). 0092 records that the hosted
  template check and live sign-in chains were **not done**; owner action.
- Return to the lesson is covered for every path (ANON-016, 0092).
- **I have no conversion figure.** `funnel_events` (051) exists, but no
  measurement of drop-off at a wall, or after an email hop, is cited anywhere.
  Everything above is mechanism, not rate.
- The post-lesson offer (0068) asks for sign-up *after* the learner has done a
  lesson. A wall asks before any work; the same email hop costs the same, with
  no investment behind it.

If ANON-010 shows Telegram sign-in works inside Telegram's browser, a wall for
Telegram-origin traffic becomes one OIDC round trip instead of an email hop.
Instagram stays email-only unless ANON-010 also passes there (its acceptance
tests both). Telegram sign-in is built in ANON-012, and `lib/inAppBrowser.ts`
becomes per-provider then.

Options:

- **A. Wall anywhere the partner marks it.** Her literal ask (default: first
  lesson open). Weakness: a Telegram post can link any lesson, and the partner
  alone decides what is behind a wall. Nothing stops the landing CTA, or a
  course's only lesson, from hitting it. Contradicts "no signup wall" with no
  limit.
- **B. No wall at all.** Preserves the handoff verbatim; rejects the partner's
  request. `signed_in` is never built.
- **C. Wall only beyond the open lessons (recommended).**
  1. No wall before a course's entry lesson.
  2. Every published course has at least one `'anyone'` lesson: a publish
     check, and `set_lesson_access_level` refuses to remove the last one from
     a published course.
  3. The landing and course CTAs point to an anon-open lesson, chosen by the
     lesson state function (CNT-012), not by `firstFreeLesson`'s boolean.
  4. Sign-in is required only to go beyond the open lessons.
  The residual gap: a deep link to a `signed_in` lesson (a Telegram post
  about lesson 4) lands on the sign-in state. C does not close that; the
  partner's choice of what to link does. ANON-011 can add an "open lesson of
  this course" link on that screen, which the state function supplies; that is
  ANON-011's scope, listed here so it is not forgotten.
- **D. Free courses only.** Rejected: access level is per lesson and
  orthogonal to entitlement, and a cohort taster (Decision 5) is a legitimate
  use of `signed_in` on a paid course. A restriction by course kind adds a
  rule with no evidence behind it.
- "Never the entry lesson of a Telegram post" cannot be enforced: the post is
  outside the app. C covers the in-app entry points only.

**Should the partner wait for ANON-012 before marking lessons sign-in?**
Recommendation: yes. Until a non-email path exists in both in-app browsers,
every wall costs an email hop. The schema (CNT-012) can ship the value
earlier; AUTH-009 can hide the `signed_in` choice until ANON-012 is done.
Reasoning from the mechanism above, not from a measurement.

**Owner's answer (Decision 2):** option C, with one change. The "at least one
`anyone` lesson" rule applies to **self-paced courses only**
(`courses.format = 'self_paced'`); it protects the reel funnel. A cohort
course may have zero `anyone` lessons: a non-enrolled visitor gets the
preview and `how_to_join_url` (0093). So `publish_course` and
`set_lesson_access_level` enforce the rule only for `self_paced`, and
`create_lesson` writes `'anyone'` for the first lesson of a self-paced
course only; every lesson of a cohort course defaults to `'entitled'`. The
"open lesson of this course" link on the sign-in screen goes to ANON-011.

**Operational guidance, not an enforced rule:** the partner waits for ANON-012
(Telegram sign-in) before marking any lesson `signed_in`. The schema allows
it earlier; nothing blocks it.

### Handoff delta (committed as "handoff: three lesson access levels; no wall before the entry lesson (0094)")

In **Audience and language**, replace "The path from that tap to a playable
lesson must have no extra clicks: no signup wall, no interstitial, no
"choose your level" gate before anything happens." with:

> The path from that tap to a playable lesson must have no extra clicks. The
> entry points — the landing and course CTAs, and every course's first lesson
> — are always playable anonymously: every published course has at least one
> lesson open to anyone. The partner may mark later lessons "sign in to
> open"; a link straight to one shows its title, description and the start of
> the lesson and asks for sign-in, and returns the learner to that lesson. No
> interstitial and no "choose your level" gate anywhere.

Reword "Registration is offered AFTER a completed lesson, never before one" to:

> Registration is offered after a completed lesson. The only thing that asks
> sooner is a lesson the partner has marked "sign in to open", and never an
> entry point.

Replace the "exactly ONE job" bullet in **Entitlement and access**:

> The per-lesson `access_level` has exactly ONE job: **who may open this
> lesson** — `anyone` (the free sample), `signed_in` (any account, which is
> free), or `entitled`. It is not a schedule (a cohort lesson's week is its
> own attribute) and not a general-purpose lock.

Update "Preview, precisely" per Decision 3. In "Partner answers", mark the
sign-in item as settled by 0094 and drop its "Conflicts the owner settles"
sentence.

## Decision 3 — Conflict 2: what a denied visitor sees

A teaser exists for **`signed_in` lessons only**. An `entitled` lesson keeps
today's preview: title, description, item count. "Partial play of paid
lessons is deliberately NOT built" is unchanged. A `signed_in` lesson's
content is free: the account costs nothing, so the teaser leaks nothing of
value. It still lives in SQL, under the same access rule, so the UI never
decides alone what a denied visitor may see (settled input 7); that is
consistency, not protection.

Options:

- **(a) Title + description only.** Trivially safe, same shape as the paid
  preview. Does not deliver "the start of the lesson".
- **(b) Leading blocks up to the first interactive block, via a SECURITY
  DEFINER function (recommended).** Refined from the card text: the cut is the
  first block that is `practice` **or** a `self_check` theory block, because
  `self_check` carries `modelAnswer` (`lib/lessons/theoryBlocks.ts:133`). The
  document is an array of blocks with `kind` `theory`/`practice`.
  `lesson_teaser(p_lesson_id)`:
  - returns rows only when the lesson is published, its course is published,
    it is not archived, and `access_level = 'signed_in'`; returns nothing for
    `anyone` (the full path serves it) and `entitled`;
  - returns the blocks before the first interactive block, **whitelisted by
    type** (`heading`, `prose`, `example`, `callout`, `list`, `image`, `video`,
    `table`), so a block type added later is excluded by default;
  - a lesson that starts with an interactive block yields an empty teaser and
    the screen falls back to (a); a lesson with no interactive block also
    yields none (otherwise it would be fully readable behind a wall, and any
    block-count cap would be an invented number).
  Answer keys and practice payloads never reach a denied client because the
  cut is made in SQL before anything is returned. CNT-012's check runs it on a
  lesson with practice blocks and asserts no practice payload and no
  `modelAnswer` in the response.
- **(c) Author-marked teaser boundary.** Most control; needs a document-schema
  field (blocks are `z.strictObject`, CNT-003) and an authoring control for a
  need no one has shown. Revisit if the partner wants to choose the cut.

**Owner's answer (Decision 3):** option (b) as written, including "no
interactive block → no teaser".

Handoff delta for "Preview, precisely":

> Title, description and item count are visible for every lesson. A lesson
> marked "sign in to open" also shows its leading theory, up to the first
> exercise or self-check. A lesson that needs entitlement shows no content.

## Decision 4 — cohort courses

0093 b: a `course_entitlements` grant ignores the schedule; the schedule
applies only to access derived from an enrolment. Extending that: `anyone`
and `signed_in` lessons ignore the schedule too, as a taster; only the
`entitled` branch consults it. Consistent with 0093, with one consequence for
the owner to confirm: a lesson marked `anyone` in week 3 is public from the
moment it is published, and enrolled learners see it early.

**One gap in 0093's no-re-lock invariant (derived from its stated principle,
not yet tested because COH-002's rule is unwritten):** 0093 Decision 5 freezes
only an *increase* of `lessons.week`. Moving a published cohort lesson from
`anyone`/`signed_in` to `entitled` while a run is in progress could lock an
enrolled learner out of a future-week lesson they could open a day earlier.
Recommendation: the same freeze applies to that level change, enforced in
`set_lesson_access_level`. CNT-012 is serialised before COH-002, so COH-002
needs this written into its matrix.

**Owner's answer (Decision 4):** an `anyone` or `signed_in` lesson in a later
week being visible early is **intended**; the schedule governs `entitled`
lessons only. The freeze is **yes**: during an in-progress run, raising a
published lesson's level to `entitled` on that course is denied (extends
0093 Decision 5, which froze only a later `lessons.week`). Lowering a level
is always allowed, since it only opens. COH-002 carries an acceptance line:
the denied raise and the allowed lowering, each with a positive control.

## Decision 5 — note for CNT-013

Moving a lesson from `signed_in` (or `anyone`) to `entitled` deliberately
removes access from signed-in, non-entitled learners (and, for `anyone`, from
anonymous visitors). It is an author action, not a regression. CNT-013's
invariant ("no editor-callable function removes access from an **entitled**
learner") is not touched, since the entitled branch bypasses level. Name it in
CNT-013's list as an intended exception beside revoke. Its cohort limit is
Decision 4's.

## Unaffected

Return-to-lesson after sign-in (ANON-016, every path); anonymous progress on
`anyone` lessons still migrates (ANON-004/013). A `signed_in` lesson has no
anonymous attempts to migrate.

## Revisit if

- ANON-010 returns no-go on either in-app browser (the wall stays an email
  hop; reconsider B).
- `funnel_events` shows a drop-off at the sign-in state worse than at the
  post-lesson offer.
- The partner needs to choose the teaser cut ((c)).
