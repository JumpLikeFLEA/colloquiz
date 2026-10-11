import { NextRequest } from "next/server";
import { z } from "zod";
import { cohortRpcResponse, INVALID_INPUT, parseBody } from "../../../../cohortRpc";

// POST { tier } → set_enrolment_tier (066, docs/decisions/0122). Changes one
// active enrolment's tier in place (0093 "Tier change"); the RPC checks
// can_edit_course and refuses a revoked enrolment.
const Body = z.object({ tier: z.enum(["basic", "extended"]) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; enrolmentId: string }> }) {
  const { enrolmentId } = await params;
  const body = await parseBody(req, Body);
  if (!body) return INVALID_INPUT();
  return cohortRpcResponse("set_enrolment_tier", { p_enrolment_id: enrolmentId, p_tier: body.tier });
}
