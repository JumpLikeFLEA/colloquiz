import { NextRequest } from "next/server";
import { cohortRpcResponse } from "../../../../cohortRpc";

// POST → close_run (058) with its default end, now(). Only a started run, and
// the end only ever moves earlier, so closing unlocks and never re-locks
// (docs/decisions/0105 Decision 8).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const { runId } = await params;
  return cohortRpcResponse("close_run", { p_run_id: runId });
}
