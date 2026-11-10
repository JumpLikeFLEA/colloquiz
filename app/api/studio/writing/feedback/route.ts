import { z } from "zod";
import { NextRequest } from "next/server";
import { FeedbackContentSchema } from "@/lib/feedback/content";
import { INVALID_INPUT, cohortRpcResponse, parseBody } from "@/app/api/admin/courses/cohortRpc";

// POST → save_writing_feedback (migration 109, docs/decisions/0225 Decision 8) from the Studio
// Written answers tab (WRITE-003). The RPC runs _writing_can_review (cohort: can_edit_course;
// linked: the teacher can still read that lesson) and validates the body again; publishing is
// one-way and locks the learner's answer, and a save after publishing edits the live text.
// There is no seat-freeze clause: a lapsed seat keeps answering what was sent to it (0155
// Decision 5). No Telegram ping yet (0225 Decision 12).
const Body = z.strictObject({
  submissionId: z.uuid(),
  body: FeedbackContentSchema,
  publish: z.boolean(),
});

export async function POST(req: NextRequest) {
  const input = await parseBody(req, Body);
  if (!input) return INVALID_INPUT();
  return cohortRpcResponse("save_writing_feedback", {
    p_submission_id: input.submissionId,
    p_body: input.body,
    p_publish: input.publish,
  });
}
