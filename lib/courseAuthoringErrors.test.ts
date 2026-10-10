import { describe, expect, it } from "vitest";
import { courseAuthoringErrorResponse } from "./courseAuthoringErrors";

describe("courseAuthoringErrorResponse", () => {
  it("maps 055's open-lesson refusal to a 409 with its own message", () => {
    expect(courseAuthoringErrorResponse("no_open_lesson")).toEqual({
      status: 409,
      body: { error: "A published course needs at least one lesson open to anyone." },
    });
  });

  it("maps 055's invalid level to a 400", () => {
    expect(courseAuthoringErrorResponse("invalid_access_level").status).toBe(400);
  });

  // Every { ok: false, error } code 058's editor RPCs return
  // (rg "'error', '" supabase/migrations/058_cohort_schema.sql), so none
  // reaches the editor as "Something went wrong."
  it.each([
    "access_level_frozen",
    "call_not_found",
    "cannot_extend_started_run",
    "format_locked",
    "invalid_ends_at",
    "invalid_format",
    "invalid_starts_at",
    "invalid_url",
    "invalid_week",
    "no_scheduled_lessons",
    "not_cohort_course",
    "run_has_enrolments",
    "run_not_found",
    "run_not_started",
    "run_started",
    "week_frozen",
    "week_required",
  ])("maps 058's %s to its own message", (code) => {
    const { status, body } = courseAuthoringErrorResponse(code);
    expect(status).not.toBe(500);
    expect(body.error).not.toBe("Something went wrong.");
  });

  // Every editor-facing { ok: false, error } code 059's invite RPCs return
  // (rg "'error', '" supabase/migrations/059_run_invites.sql, minus the
  // claim's own states, which the claim page renders).
  it.each([
    "forbidden",
    "invalid_invitee_contact",
    "invalid_invitee_name",
    "invalid_tier",
    "invite_not_found",
    "rate_limited",
    "run_ended",
    "run_not_found",
  ])("maps 059's %s to its own message", (code) => {
    const { body } = courseAuthoringErrorResponse(code);
    expect(body.error).not.toBe("Something went wrong.");
  });

  it("maps the invite rate limit to a 429", () => {
    expect(courseAuthoringErrorResponse("rate_limited").status).toBe(429);
  });

  it("maps the re-lock refusals to a 409", () => {
    expect(courseAuthoringErrorResponse("week_frozen").status).toBe(409);
    expect(courseAuthoringErrorResponse("access_level_frozen").status).toBe(409);
  });

  it("falls back to a generic 400 for an unknown code", () => {
    expect(courseAuthoringErrorResponse("not_a_code")).toEqual({
      status: 400,
      body: { error: "Something went wrong." },
    });
  });
});
