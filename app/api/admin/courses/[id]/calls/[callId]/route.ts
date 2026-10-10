import { NextRequest } from "next/server";
import { z } from "zod";
import { cohortRpcResponse, InstantSchema, INVALID_INPUT, parseBody } from "../../../cohortRpc";

const Schema = z.object({
  startsAt: InstantSchema,
  meetUrl: z.string().max(2000),
  title: z.string().max(120).nullable(),
});

type Params = { params: Promise<{ id: string; callId: string }> };

// PATCH { startsAt, meetUrl, title } → update_call (058), a full replace.
export async function PATCH(req: NextRequest, { params }: Params) {
  const { callId } = await params;
  const body = await parseBody(req, Schema);
  if (!body) return INVALID_INPUT();
  return cohortRpcResponse("update_call", {
    p_call_id: callId,
    p_starts_at: body.startsAt,
    p_meet_url: body.meetUrl,
    p_title: body.title,
  });
}

// DELETE → delete_call (058).
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { callId } = await params;
  return cohortRpcResponse("delete_call", { p_call_id: callId });
}
