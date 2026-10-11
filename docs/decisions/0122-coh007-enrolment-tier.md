# 0122 — COH-007: an editor changes an enrolment's tier

Status: **decided unattended** (COH-007 ran `--no-approval`), open to
correction. Migration 066 is written and not applied.

## Context

0093 "Tier change" settled the shape: basic → extended updates
`run_enrolments.tier` in place, with no tier history. 0107 Decision 3 found
that nothing writes it. A second invite to a learner who is already enrolled
is refused (`already_enrolled`) on purpose, so today an upgrade takes a
revoke followed by a new invite. Tier gates exactly one thing: whether
`course_calls` (058) returns the run's calls to the learner. The lesson
access function never reads tier.

## Decision 1 — `set_enrolment_tier(enrolment, tier)`, keyed on the enrolment

A SECURITY DEFINER RPC in migration 066. Order of checks:

1. `enrolment_not_found`.
2. `forbidden` unless `can_edit_course` on the run's course (058's
   convention: nothing beyond "not found" before the gate).
3. `invalid_tier`.
4. `enrolment_revoked`.

Setting the tier the enrolment already has returns `ok` with
`changed: false`. EXECUTE is granted to `authenticated` only. Grants on
`run_enrolments` are unchanged (`authenticated:SELECT`, printed).

It is keyed on the enrolment, not the invite, because the enrolment is what
carries the tier. AUTH-011's roster already returns `enrolment_id`, so a
roster control could call the same RPC later.

A revoked enrolment is refused rather than revived. A refunded learner comes
back through a new invite (0093 c: a revoked row stays as history), never
through a tier edit.

Changing the tier of an enrolment in an ended run is allowed. It is
harmless (it only changes which past calls the learner sees) and refusing it
would need another rule.

## Decision 2 — the invite's tier follows the enrolment

The same call sets `run_invites.tier` on the invite that created the
enrolment (`run_invites.enrolment_id`). Without that, the runs page row and
the claim page (`run_invite_preview`) would keep naming the tier the learner
had at claim time.

0093 keeps no tier history, so the invite's original tier is not treated as
a record worth keeping.

The RPC locks the invite before the enrolment, the same order
`revoke_run_invite` (059) uses, so the two can't deadlock.

Alternative not taken: leave `run_invites.tier` alone and have
`course_run_invites` return the enrolment's tier. That fixes the runs page
but not the claim page, and it splits one fact across two columns.

## Decision 3 — `course_run_invites` re-emitted with `enrolment_id`

The runs page needs the enrolment id of a claimed invite. 066 re-emits
059's body with that one column appended. A RETURNS TABLE change needs
DROP + CREATE, so the grants are re-stated. No later migration redefined
the function (`grep "FUNCTION course_run_invites" supabase/migrations`
lists only 059).

## Decision 4 — the control lives on the runs page's claimed invite row

The card allowed either place. The runs page is where the tier is set (New
invite) and where the enrolment is ended (Revoke), so changing it there
keeps all three actions on one row.

The control is an icon button (`ArrowUpDown`, the row's `ICON_BUTTON`
class). It shows only on a `claimed` row that has an enrolment id. It opens
the page's existing AlertDialog, which names the target tier and what the
learner gains or loses: "calls … on the course page. Their access to
lessons doesn't change." Tier is binary, so there is no picker. Refusals
are toasted through `lib/courseAuthoringErrors.ts`, like every other action
on that page.

A roster control is not built. It can be proposed if the partner looks for
the action there.

## Decision 5 — `enrolment_revoked`'s message made generic

The code already existed for `save_final_comment` (061), with a message
about final comments: "…so they can't get a final comment." There is one
message per code, so the message now names the state instead of the
action: "This learner's access to the run was revoked, so this can't be
changed." The review queue's refusal reads slightly differently as a
result. No caller matched on the old text (grep).

## Revisit if

- The partner wants a tier history, for a refund dispute for example. Then
  this becomes an event table and not an in-place update.
- A third tier appears. The binary "switch to the other" dialog becomes a
  Select.
- Tier starts gating lesson access. Then a change to it touches the access
  function, and PLAY-006's anonymous-path rows must re-run.
