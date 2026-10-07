# 0083 — OPS-016: privacy policy versioning, and the error-monitoring text

## Context

`docs/release/legal/privacy-policy.md` §13 tells users: "We will post any
change here with a new version number and date." Three commits changed the
rendered policy after its last bump (2026-09-26, db2c2a8, OPS-012) and left
"Version 1.0 · Last updated 2026-09-26" alone: 13ed29c (OPS-008, funnel
events), dafa065 (OPS-009, lesson attempts and localStorage progress) and
89e4714 (ANON-009, signup source). `git log -- docs/release/legal/` lists
them. Nothing written down said a bump was required, so each session skipped
it.

OPS-012 (db2c2a8) removed Sentry and the §4 "error monitoring" wording, and
bumped the date. It missed the §3.3 paragraph ("We use an error-monitoring
service…") and the §7 "Error reports" retention row. `git show db2c2a8 --
docs/release/legal` shows the hunks it did change.

## Decision 1 — remove the error-monitoring text, don't rewrite it

Both passages are deleted. Nothing in the code sends an error report
anywhere. The three error boundaries (`app/(english)/error.tsx`,
`app/(colloquiz)/(auth)/error.tsx`, `app/(colloquiz)/(main)/error.tsx`) only
call `console.error` in the visitor's own browser. `rg -i sentry` outside
`node_modules` finds only backlog text and a historical comment in
`scripts/budget.ts`. Errors in server logs are already covered by §3.3's
"Our hosting and database providers process standard server data… in their
own operational logs" and the §7 "Provider server logs" row. A separate
error-report line would describe a second recipient that doesn't exist.

`subprocessors.md` has no error-monitoring text (OPS-012 removed the Sentry
row), so it is unchanged and keeps its own version and date.

## Decision 2 — every rendered change bumps the version and the date

Any edit to text that renders on /privacy, meaning everything outside the
maintainer blockquotes that `lib/legalDoc.tsx` drops, does two things in the
same commit:

- raises the minor version (1.0 → 1.1 → 1.2 …);
- sets "Last updated" to the commit date.

Edits that only touch the maintainer blockquotes don't bump.

This card bumps to 1.1, dated 2026-10-07. That one bump covers OPS-008,
OPS-009, ANON-009 and this card. There is no 1.0.x history to rebuild:
those intermediate texts were never versioned, and inventing version numbers
for them after the fact would record something that didn't happen.

The rule is in the policy file itself, in its top maintainer blockquote,
because that file is what the next session to edit the policy opens. The
renderer drops blockquotes, so learners never see the note.
`subprocessors.md` already has the same rule as step 3 of its "Change
procedure".

Options considered:
- **Bump only for material changes.** Rejected. §13 says "any change". It
  would also make every edit a judgement about materiality, which is the
  judgement that was skipped three times.
- **Date only, version for material changes.** Rejected for the same
  reason: §13 promises both.

A major version is not tied to anything here. §13 also says that for a
change that "materially affects your rights, we will tell you in the app or
by email before it takes effect". Deciding what counts as material, and
building that notice, is the owner's call (see "Open").

## Open — not decided here

Whether OPS-008's funnel events or ANON-009's signup source were material
changes that needed the §13 notice before taking effect. That is a legal
judgement, not a versioning one, and it is raised in OPS-016's evidence
comment for the owner.

## What would make us revisit this

- Legal review asks for a different scheme, for example dated versions or a
  changelog section on /privacy.
- The Terms of Service gets the same problem. It has its own version line
  (`terms-of-service.md`, 1.0, 2026-09-01) and `profiles.terms_version`
  (migration 036) stamps it at signup. This decision does not cover it.
