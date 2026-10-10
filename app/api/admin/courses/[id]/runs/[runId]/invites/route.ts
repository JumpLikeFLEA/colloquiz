import { NextRequest } from "next/server";
import { z } from "zod";
import { cohortRpcResponse, INVALID_INPUT, parseBody } from "../../../../cohortRpc";

const Schema = z.object({
  tier: z.enum(["basic", "extended"]),
  name: z.string().max(200),
  contact: z.string().max(300),
});

// POST { tier, name, contact } → create_run_invite (059, docs/decisions/
// 0107). The RPC checks can_edit_course on the run's course, validates the
// label, rate-limits the editor and returns the raw token once. The token
// is passed straight back to the editor's browser and is not logged.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const { runId } = await params;
  const body = await parseBody(req, Schema);
  if (!body) return INVALID_INPUT();
  return cohortRpcResponse("create_run_invite", {
    p_run_id: runId,
    p_tier: body.tier,
    p_name: body.name,
    p_contact: body.contact,
  });
}
