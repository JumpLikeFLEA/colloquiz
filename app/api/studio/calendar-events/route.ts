import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { callCohortRpc, InstantSchema, INVALID_INPUT, parseBody } from "@/app/api/admin/courses/cohortRpc";
import { courseAuthoringErrorResponse } from "@/lib/courseAuthoringErrors";

const Id = z.string().uuid();
const Fields = {
  title: z.string().max(400),
  startsAt: InstantSchema,
  endsAt: InstantSchema.nullable(),
  link: z.string().max(2000).nullable(),
};

const Schema = z.discriminatedUnion("action", [
  // Exactly one of runId / groupId; the RPC refuses both or neither (invalid_scope).
  z.object({ action: z.literal("create"), runId: Id.nullable(), groupId: Id.nullable(), ...Fields }),
  z.object({ action: z.literal("update"), eventId: Id, ...Fields }),
  z.object({ action: z.literal("delete"), eventId: Id }),
]);

/**
 * COH-014 (docs/decisions/0158) — Studio's calendar-event actions as JSON:
 *   { action: "create", runId | groupId, title, startsAt, endsAt, link } -> { id }
 *   { action: "update", eventId, title, startsAt, endsAt, link }         -> { ok }
 *   { action: "delete", eventId }                                        -> { ok }
 *
 * Each is a SECURITY DEFINER RPC (084) that decides who may do it (an editor
 * of the run's course; the group's own teacher; an active seat) and checks
 * every field. This route validates the shape and relays the RPC's error code
 * as a message.
 */
export async function POST(request: NextRequest) {
  const body = await parseBody(request, Schema);
  if (!body) return INVALID_INPUT();

  const called =
    body.action === "create"
      ? await callCohortRpc("create_calendar_event", {
          p_run: body.runId,
          p_group: body.groupId,
          p_title: body.title,
          p_starts_at: body.startsAt,
          p_ends_at: body.endsAt,
          p_link: body.link,
        })
      : body.action === "update"
        ? await callCohortRpc("update_calendar_event", {
            p_event: body.eventId,
            p_title: body.title,
            p_starts_at: body.startsAt,
            p_ends_at: body.endsAt,
            p_link: body.link,
          })
        : await callCohortRpc("delete_calendar_event", { p_event: body.eventId });
  if ("response" in called) return called.response;

  const { ok, error, ...rest } = called.result;
  if (!ok) {
    const { status, body: err } = courseAuthoringErrorResponse(error);
    return NextResponse.json(err, { status });
  }
  return NextResponse.json({ ok: true, ...rest });
}
