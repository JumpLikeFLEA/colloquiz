import { NextRequest } from "next/server";
import { z } from "zod";
import { cohortRpcResponse, INVALID_INPUT, parseBody } from "../../cohortRpc";

const Schema = z.object({ url: z.string().max(2000).nullable() });

// POST { url } → set_course_how_to_join_url (058). Empty or null clears it;
// the RPC checks for https (invalid_url).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await parseBody(req, Schema);
  if (!body) return INVALID_INPUT();
  return cohortRpcResponse("set_course_how_to_join_url", { p_course_id: id, p_url: body.url });
}
