import { NextRequest } from "next/server";
import { z } from "zod";
import { cohortRpcResponse, INVALID_INPUT, parseBody } from "../../../../cohortRpc";

const Schema = z.object({ week: z.number().int().min(1).max(32767).nullable() });

// POST { week } → set_lesson_week (058, docs/decisions/0105 Decision 1). The
// RPC holds the no-re-lock rule: while a run is in progress, a published
// lesson's week may only move earlier (week_frozen).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; lessonId: string }> },
) {
  const { lessonId } = await params;
  const body = await parseBody(req, Schema);
  if (!body) return INVALID_INPUT();
  return cohortRpcResponse("set_lesson_week", { p_lesson_id: lessonId, p_week: body.week });
}
