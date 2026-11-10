import { describe, expect, it } from "vitest";
import { WRITING_ANSWER_MAX_CHARS } from "../lessons/taskBlocks";
import { checkWritingBody, normaliseWritingBody, WRITING_ERROR_STATUS, WRITING_FALLBACK_ERRORS } from "./answer";

describe("normaliseWritingBody", () => {
  it("turns CRLF and lone CR into LF and trims the ends", () => {
    expect(normaliseWritingBody("  a\r\nb\rc  \n")).toBe("a\nb\nc");
  });
  it("keeps inner blank lines and spaces", () => {
    expect(normaliseWritingBody("a\n\n  b")).toBe("a\n\n  b");
  });
});

describe("checkWritingBody", () => {
  it("accepts a normal answer, normalised", () => {
    expect(checkWritingBody(" Hi\r\nthere ")).toEqual({ ok: true, body: "Hi\nthere" });
  });
  it("refuses empty, whitespace-only and non-strings", () => {
    for (const v of ["", " \n\t ", undefined, null, 5, {}]) {
      expect(checkWritingBody(v)).toEqual({ ok: false, error: "invalid_body" });
    }
  });
  it("accepts exactly the cap and refuses one more (boundary)", () => {
    expect(checkWritingBody("a".repeat(WRITING_ANSWER_MAX_CHARS)).ok).toBe(true);
    expect(checkWritingBody("a".repeat(WRITING_ANSWER_MAX_CHARS + 1)).ok).toBe(false);
  });
  it("counts a CRLF pair as one character, as the database does", () => {
    const body = "a" + "\r\n".repeat(2000) + "b"; // 4002 raw characters, 4002 - 2000 after normalising
    expect(checkWritingBody(body).ok).toBe(true);
  });
  it("trims before the cap, so padding does not count", () => {
    expect(checkWritingBody(" ".repeat(50) + "a".repeat(WRITING_ANSWER_MAX_CHARS)).ok).toBe(true);
  });
});

describe("refusal maps", () => {
  it("every fallback refusal has a status, and none is a 5xx", () => {
    for (const code of WRITING_FALLBACK_ERRORS) {
      expect(WRITING_ERROR_STATUS[code]).toBeGreaterThanOrEqual(400);
      expect(WRITING_ERROR_STATUS[code]).toBeLessThan(500);
    }
  });
  it("invalid_body and unauthenticated are not fallbacks (the card keeps Send)", () => {
    expect(WRITING_FALLBACK_ERRORS.has("invalid_body")).toBe(false);
    expect(WRITING_FALLBACK_ERRORS.has("unauthenticated")).toBe(false);
  });
});
