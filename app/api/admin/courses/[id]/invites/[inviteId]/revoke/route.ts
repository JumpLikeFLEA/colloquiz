import { NextRequest } from "next/server";
import { cohortRpcResponse } from "../../../../cohortRpc";

// POST → revoke_run_invite (059, docs/decisions/0107). Kills an unclaimed
// link; on a claimed one it also ends exactly the enrolment that invite
// created (0093 Decision 2). Idempotent.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; inviteId: string }> }) {
  const { inviteId } = await params;
  return cohortRpcResponse("revoke_run_invite", { p_invite_id: inviteId });
}
