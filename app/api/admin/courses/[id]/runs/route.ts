import { NextRequest } from "next/server";
import { z } from "zod";
import { cohortRpcResponse, InstantSchema, INVALID_INPUT, parseBody } from "../../cohortRpc";

const Schema = z.object({ startsAt: InstantSchema, title: z.string().max(120).nullable() });

// POST { startsAt, title } → create_run (058). The RPC computes ends_at from
// the course's weeks and refuses on a self-paced course or with no week set.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await parseBody(req, Schema);
  if (!body) return INVALID_INPUT();
  return cohortRpcResponse("create_run", { p_course_id: id, p_starts_at: body.startsAt, p_title: body.title });
}
