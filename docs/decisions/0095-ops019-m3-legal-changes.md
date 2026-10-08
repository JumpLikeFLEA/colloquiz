# 0095 — OPS-019: M3 legal changes, materiality and notice

Owner decision, 2026-10-08, from the options laid out on issue #145.

## Context

Privacy §13 promises notice "in the app or by email before it takes effect" for
a change that "materially affects your rights"; Terms §10 promises 14 days'
notice for material changes. M3 contradicts or extends current text:
terms-of-service.md:57–60 and :130 and privacy-policy.md:140 say the Service is
free; privacy-policy.md:174 says an email is never shown to other users;
nothing covers voice recordings or invite contact labels; Telegram is not a
listed provider (subprocessors.md). Invite contact labels are personal data
(0093, "Invite contact labels"). `handle_new_user()` hardcodes
`terms_version = '1.0'` (`supabase/migrations/036_terms_acceptance.sql`).

## Owner facts

- Production has no real accounts. Every real learner signs up after launch
  (OPS-010).
- For now the partner sells through her Patreon. "We" take payments only if the
  project grows; that will be its own Terms revision.
- Voice recordings are kept 6 months after the run ends.

## Decision 1 — one revision before launch, worded conditionally

Terms 1.1 and Privacy 1.2 ship once, before launch, instead of per-card text
and bumps (this replaces the per-card "Ships OPS-019's text" lines). The text is
conditional ("if you join a cohort course…", "if you send a voice
recording…", "if you sign in with Telegram…"). With no real accounts nobody is
owed notice, nothing applies retroactively, and no 14-day clock touches M3. If
a feature ships differently (e.g. ANON-010 is no-go), its card corrects or
removes the line; removing a disclosure is not material.

**After launch,** a material change gets an in-app banner (Option A). Rationale:
Terms §10 and Privacy §13 both allow "in the app", and Telegram accounts have
no email. Resend is planned for auth email (0081, launch checklist §1), so
email exists later; it is not why A is enough.

### Materiality reference (for changes after launch)

| Change | Material? | Notice |
|---|---|---|
| Free promise reworded for paid courses (terms:57, privacy:140) | Yes | In-app banner, 14 days (Terms) |
| Author sees learner contact, activity, acquisition (privacy:174) | Yes — reverses an explicit promise | In-app banner before it ships |
| Voice recordings | Yes — new data category | In-app banner; data exists only after a learner sends one |
| Telegram as identity provider | No — an added sign-in method, listed in subprocessors | Version bump only |
| Invite contact labels | No for existing users (not in the table) | Disclosed in the policy |

Before launch none of these needs notice (Decision 1).

## Decision 2 — text the revision carries

**Terms**
- :57–60 — Colloquiz itself is free to use. Some courses are paid; their
  authors sell them, not us (Decision 3). Free courses and anything earned
  are not put behind a paywall.
- :130 (§8) — the liability cap currently rests on "the Service is provided
  free of charge". Reword to rest on what stays true: we take no payment from
  you.

**Privacy**
- :140 — drop "(the Service is free)". We collect no payment details; paid
  courses are paid to the author through a third-party platform and we never
  see card or account details.
- :174 and §5 — your email is not shown to other learners. The author of a
  course you take while signed in (free or paid) sees your email or Telegram
  username, your invite's contact label, how you found the course (course and
  channel) and your activity in that course: lessons opened and completed,
  recordings sent and answered, last activity. Purpose: to run the course and
  contact you about it.
- Voice — your audio for a voice task; kept for the author's written feedback
  and the before/after screen; heard by you and the course author, accessed by
  us only to run the service. A recording you replace is deleted when you
  replace it. All recordings are deleted 6 months after the run ends, or when
  you delete your account, whichever comes first. Practice recordings in free
  or anonymous lessons stay on your device and are never uploaded (assumed
  decision C). Recordings are never used for promotion.
- Telegram — "what we collect" lists the `identity_data` fields (ANON-010
  prints the real list; until then, Telegram's documented claims).
  `subprocessors.md` adds Telegram.
- Invite contact labels — an author records a name and a contact (email or
  @telegram) to send you an invite, and only course editors see it. Once
  claimed, it is kept with your enrolment and deleted with your account.
  Unclaimed labels are deleted 30 days after the invite expires or is
  revoked.

## Decision 3 — paid access wording (owner)

"Paid courses are sold by their author through Patreon or a similar platform,
under that platform's terms, and refunds are handled by the author there.
After payment, the author sends you an invite that gives you access. If the
payment is refunded or charged back, your access ends."

## Decision 4 — Terms versioning

0083's minor-bump rule extends to the Terms. `handle_new_user()` is not
re-emitted on every bump: the 1.1 migration redefines it once, from 036's
body, to call `current_terms_version()`; later bumps replace only that
function. A guard test (0034's pattern) fails if the version in the latest
`current_terms_version()` disagrees with the Terms markdown header. The owner
applies the migration; it must be applied before launch, or new signups are
stamped 1.0 against Terms 1.1.

## Open (recorded, not decided)

- **Russian version.** Recommendation for the owner: learners are A2–B1, so
  the short notices (sign-up consent line, recorder line, claim-page line)
  should carry Russian before the full documents do. This touches settled
  input 9 and assumed decision B, so it is the owner's call.
- **Outside this card:** some learners live in Russia (handoff, "Audience and
  language"). Whether Russia's data-localisation law (152-FZ) applies needs an
  answer before the project markets to them.

## What would make us revisit this

- "We" start taking payments: a new Terms revision (seller identity,
  withdrawal and refund rights, a cap tied to the amount paid), the legal
  review the Terms header asks for, notice per Option A, and acceptance at
  checkout.
- Any wish to use recordings for promotion: a separate opt-in, decided first.
- ANON-010 is no-go: ANON-012 and the Telegram lines are corrected or removed.

## Board consequences

- OPS-022 "Legal revision for launch" (M2, rank 2209.5, ahead of OPS-010,
  which depends on it) carries Decisions 2 to 4. It drafts all three legal
  files and stops for owner sign-off on the full diff before committing.
  OPS-010 gains the check that a fresh production signup has
  `profiles.terms_version = '1.1'` after the owner applies the migration.
- OPS-022 keeps `dependsOn: ['OPS-019']` as the record. OPS-019 is an M3
  card, so it must not hold up M2's exit: it is closed by this commit's
  `Closes #145` when the owner pushes.
- VOICE-004 gains the 6-month automatic purge and the replaced-recording
  deletion; COH-003 gains the 30-day unclaimed-label purge; COH-005 renders a
  purged recording as removed, not as "before missing".
- COH-003, AUTH-011, VOICE-004, VOICE-005, ANON-012 and PROG-001 depend on
  OPS-022 and replace "ships the text" with "the live legal text describes
  what this card does; if it doesn't, stop and ask".
