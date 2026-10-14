# 0138 — COH-009: an editor can delete an unclaimed invite

## Context
Owner report, 2026-10-14: an author typed a wrong email into an invite and had
no way to remove it. The runs page offered Revoke only (`revoke_run_invite`,
059), which sets `revoked_at` and keeps the row, with its name and contact, until
`purge_unclaimed_run_invites` deletes it 30 days after the invite ends
(059 section 6). That is a cause read from the 059 source, not a measured one.

## Options
1. Delete an unclaimed invite outright. Claimed ones stay Revoke-only.
2. Let Delete also remove a claimed invite. Rejected: the label is kept with the
   enrolment (059 section 6) and is exported to the learner.
3. Shorten the purge window. Rejected: it does not give the editor a delete.

## Decision
Option 1. `delete_run_invite(p_invite_id)` (071): SECURITY DEFINER, `forbidden`
unless `can_edit_course`, `invite_claimed` if `claimed_at IS NOT NULL`, otherwise
DELETE. The row is locked FOR UPDATE so a racing claim serialises with it. No
grants change. The runs page shows Delete on every unclaimed row (pending,
expired, revoked-unclaimed), beside Revoke on a pending one. Route:
`DELETE /api/admin/courses/[id]/invites/[inviteId]`.

## Verification status
`npm run check` and `npm test` pass (the new error code is covered in
`lib/courseAuthoringErrors.test.ts`). The RPC protocol (editor deletes a pending
invite; claimed invite, non-editor and editor of another course refused; deleted
token gives `not_found` from `run_invite_preview`) needs 071 applied by the
owner and is run after that.

## Revisit if
Editors need to delete a claimed invite's label without ending access.
