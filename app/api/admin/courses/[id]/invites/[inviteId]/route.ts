import { NextRequest } from "next/server";
import { cohortRpcResponse } from "../../../cohortRpc";

// DELETE → delete_run_invite (071, COH-009). Removes an invite nobody has
// claimed, label included. A claimed invite is refused (invite_claimed):
// revoke it instead.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; inviteId: string }> }) {
  const { inviteId } = await params;
  return cohortRpcResponse("delete_run_invite", { p_invite_id: inviteId });
}
