import { NextRequest } from "next/server";
import { z } from "zod";
import { cohortRpcResponse, InstantSchema, INVALID_INPUT, parseBody } from "../../../cohortRpc";

const Schema = z.object({ startsAt: InstantSchema, title: z.string().max(120).nullable() });

type Params = { params: Promise<{ id: string; runId: string }> };

// PATCH { startsAt, title } → update_run (058), a full replace. A started
// run's start is frozen (run_started), so the editor sends it back unchanged
// to edit only the title.
export async function PATCH(req: NextRequest, { params }: Params) {
  const { runId } = await params;
  const body = await parseBody(req, Schema);
  if (!body) return INVALID_INPUT();
  return cohortRpcResponse("update_run", { p_run_id: runId, p_starts_at: body.startsAt, p_title: body.title });
}

// DELETE → delete_run (058): only a run that hasn't started and has never had
// an enrolment (docs/decisions/0105 Decision 8).
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { runId } = await params;
  return cohortRpcResponse("delete_run", { p_run_id: runId });
}
