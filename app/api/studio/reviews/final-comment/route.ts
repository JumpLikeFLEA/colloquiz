import { NextRequest } from "next/server";
import { z } from "zod";
import { FeedbackContentSchema } from "@/lib/feedback/content";
import { INVALID_INPUT, cohortRpcResponse, parseBody } from "@/app/api/admin/courses/cohortRpc";

// POST → save_final_comment (061, docs/decisions/0112) from the Studio
// review queue (VOICE-006, 0114). The RPC checks can_edit_course on the
// enrolment's course, refuses a revoked enrolment and validates the body;
// publishing is one-way.
const Body = z.strictObject({
  enrolmentId: z.uuid(),
  body: FeedbackContentSchema,
  publish: z.boolean(),
});

export async function POST(req: NextRequest) {
  const input = await parseBody(req, Body);
  if (!input) return INVALID_INPUT();
  return cohortRpcResponse("save_final_comment", {
    p_enrolment_id: input.enrolmentId,
    p_body: input.body,
    p_publish: input.publish,
  });
}
