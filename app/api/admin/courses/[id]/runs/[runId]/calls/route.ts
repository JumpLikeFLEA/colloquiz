import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { MAX_WEEKLY_REPEATS } from "@/lib/cohortSchedule";
import { courseAuthoringErrorResponse } from "@/lib/courseAuthoringErrors";
import { callCohortRpc, InstantSchema, INVALID_INPUT, parseBody } from "../../../../cohortRpc";

const Schema = z.object({
  startsAt: z.array(InstantSchema).min(1).max(MAX_WEEKLY_REPEATS),
  meetUrl: z.string().max(2000),
  title: z.string().max(120).nullable(),
});

// POST { startsAt[], meetUrl, title } → create_call (058), once per time.
// One time is a single call; several are the "repeat weekly ×N" helper, whose
// times the client derives (lib/cohortSchedule.ts `weeklyRepeats`). There is
// no batch RPC, and adding one is a schema change, so this loops. It stops at
// the first refusal and says how many were created. Every call shares the
// same URL and title, so a URL refusal comes on the first one and creates
// nothing (docs/decisions/0106 Decision 4).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const { runId } = await params;
  const body = await parseBody(req, Schema);
  if (!body) return INVALID_INPUT();

  let created = 0;
  for (const startsAt of body.startsAt) {
    const called = await callCohortRpc("create_call", {
      p_run_id: runId,
      p_starts_at: startsAt,
      p_meet_url: body.meetUrl,
      p_title: body.title,
    });
    if ("response" in called) return called.response;
    if (!called.result.ok) {
      const { status, body: err } = courseAuthoringErrorResponse(called.result.error);
      const prefix = created > 0 ? `Created ${created} of ${body.startsAt.length} calls. ` : "";
      return NextResponse.json({ error: prefix + err.error, created }, { status });
    }
    created++;
  }
  return NextResponse.json({ ok: true, created });
}
