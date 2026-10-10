import { NextRequest } from "next/server";
import { z } from "zod";
import { cohortRpcResponse, INVALID_INPUT, parseBody } from "../../cohortRpc";

const Schema = z.object({ format: z.enum(["self_paced", "cohort"]) });

// POST { format } → set_course_format (058). The RPC refuses once the course
// has a run (format_locked) and, for a published course going back to
// self-paced, without a lesson open to anyone (no_open_lesson).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await parseBody(req, Schema);
  if (!body) return INVALID_INPUT();
  return cohortRpcResponse("set_course_format", { p_course_id: id, p_format: body.format });
}
