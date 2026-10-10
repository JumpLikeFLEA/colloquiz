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

  it("falls back to a generic 400 for an unknown code", () => {
    expect(courseAuthoringErrorResponse("not_a_code")).toEqual({
      status: 400,
      body: { error: "Something went wrong." },
    });
  });
});
