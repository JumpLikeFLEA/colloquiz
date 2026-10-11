import { NextRequest } from "next/server";
import { z } from "zod";
import { FeedbackContentSchema } from "@/lib/feedback/content";
import { INVALID_INPUT, cohortRpcResponse, parseBody } from "@/app/api/admin/courses/cohortRpc";

// POST → save_voice_feedback (060, docs/decisions/0110 Decision 3) from the
// Studio review queue (VOICE-006, 0114). The RPC checks can_edit_course on
// the submission's course and validates the body again; publishing is
// one-way, and a save after publishing edits the live text.
const Body = z.strictObject({
  submissionId: z.uuid(),
  body: FeedbackContentSchema,
  publish: z.boolean(),
});

export async function POST(req: NextRequest) {
  const input = await parseBody(req, Body);
  if (!input) return INVALID_INPUT();
  return cohortRpcResponse("save_voice_feedback", {
    p_submission_id: input.submissionId,
    p_body: input.body,
    p_publish: input.publish,
  });
}
