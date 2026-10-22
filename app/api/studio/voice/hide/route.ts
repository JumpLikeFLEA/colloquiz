import { NextRequest } from "next/server";
import { z } from "zod";
import { INVALID_INPUT, cohortRpcResponse, parseBody } from "@/app/api/admin/courses/cohortRpc";

// POST → hide_voice_analysis (096, VOICE-015, docs/decisions/0190). The RPC checks
// can_edit_course on the take's course, then the seat (083 `_studio_can_write`), and only a
// finished analysis can be hidden. Hiding gives the send back and makes the learner's view read
// "Feedback withdrawn" (0189). Takes only the take's id.
const Body = z.strictObject({ submissionId: z.uuid() });

export async function POST(req: NextRequest) {
  const input = await parseBody(req, Body);
  if (!input) return INVALID_INPUT();
  return cohortRpcResponse("hide_voice_analysis", { p_submission_id: input.submissionId });
}
