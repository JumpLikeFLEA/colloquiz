import { describe, expect, it } from "vitest";
import { parseVoiceCap } from "./analysisCaps";

describe("parseVoiceCap", () => {
  it("reads the per-task cap", () => {
    expect(parseVoiceCap({ code: "PT429", details: "task_cap", hint: null })).toEqual({ kind: "task_cap", retryAt: null });
  });

  it("reads the daily cap with the next free time", () => {
    expect(parseVoiceCap({ code: "PT429", details: "daily_cap", hint: "2026-10-21T18:07:26.342170Z" })).toEqual({
      kind: "daily_cap",
      retryAt: "2026-10-21T18:07:26.342Z",
    });
  });

  it("gives no time for a daily cap whose hint is missing or unreadable", () => {
    expect(parseVoiceCap({ code: "PT429", details: "daily_cap" })?.retryAt).toBeNull();
    expect(parseVoiceCap({ code: "PT429", details: "daily_cap", hint: "soon" })?.retryAt).toBeNull();
  });

  it("is not a cap for any other code, an unknown detail, or no error", () => {
    expect(parseVoiceCap({ code: "22P02", details: "task_cap" })).toBeNull();
    expect(parseVoiceCap({ code: "PT429", details: "something_else" })).toBeNull();
    expect(parseVoiceCap({ code: "PT429" })).toBeNull();
    expect(parseVoiceCap(null)).toBeNull();
    expect(parseVoiceCap(undefined)).toBeNull();
  });
});
