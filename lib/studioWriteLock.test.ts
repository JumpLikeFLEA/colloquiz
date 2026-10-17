import { describe, expect, it } from "vitest";
import {
  SEAT_LAPSED_MESSAGE,
  UNLOCKED,
  WRITE_STATE_UNKNOWN,
  formatSeatDate,
  toWriteState,
  writeBanner,
  writeLockFor,
} from "./studioWriteLock";

describe("toWriteState", () => {
  it("reads the predicate's boolean and the seat's date", () => {
    expect(toWriteState(false, [{ is_active: false, expires_at: "2026-10-13T08:00:00+00:00" }])).toEqual({
      canWrite: false,
      hasSeat: true,
      expiresAt: "2026-10-13T08:00:00+00:00",
    });
  });

  it("an open-ended seat has no date, a missing seat has no seat", () => {
    expect(toWriteState(true, [{ is_active: true, expires_at: null }])).toEqual({ canWrite: true, hasSeat: true, expiresAt: null });
    expect(toWriteState(false, [])).toEqual({ canWrite: false, hasSeat: false, expiresAt: null });
  });

  it("does not freeze the page when the predicate could not be read", () => {
    expect(toWriteState(null, [])).toEqual(WRITE_STATE_UNKNOWN);
    expect(toWriteState(undefined, undefined)).toEqual(WRITE_STATE_UNKNOWN);
    expect(WRITE_STATE_UNKNOWN.canWrite).toBe(true);
  });
});

describe("writeLockFor", () => {
  it("is unlocked with no reason when the caller can write", () => {
    expect(writeLockFor({ canWrite: true, hasSeat: true, expiresAt: null })).toBe(UNLOCKED);
    expect(UNLOCKED.reason).toBe("");
  });

  it("is locked with the reason when the caller cannot", () => {
    expect(writeLockFor({ canWrite: false, hasSeat: true, expiresAt: "2026-10-13T00:00:00Z" })).toEqual({
      locked: true,
      reason: SEAT_LAPSED_MESSAGE,
    });
  });
});

describe("formatSeatDate", () => {
  it("prints the UTC day", () => {
    expect(formatSeatDate("2026-10-13T23:30:00Z")).toBe("13 Oct 2026");
    expect(formatSeatDate("2026-01-01T00:00:00Z")).toBe("1 Jan 2026");
  });

  it("prints nothing for a value that is not a date", () => {
    expect(formatSeatDate("soon")).toBe("");
  });
});

describe("writeBanner", () => {
  it("is null when the caller can write", () => {
    expect(writeBanner({ canWrite: true, hasSeat: true, expiresAt: null })).toBeNull();
  });

  it("names the expiry date for a lapsed seat and what is not lost", () => {
    const b = writeBanner({ canWrite: false, hasSeat: true, expiresAt: "2026-10-13T08:00:00Z" });
    expect(b?.title).toContain("read-only");
    expect(b?.detail).toContain("13 Oct 2026");
    expect(b?.detail).toContain("keep their access");
  });

  it("does not claim a date it does not have", () => {
    const b = writeBanner({ canWrite: false, hasSeat: true, expiresAt: null });
    expect(b?.detail).not.toContain("It ended on");
  });

  it("says there is no seat when there is none", () => {
    const b = writeBanner({ canWrite: false, hasSeat: false, expiresAt: null });
    expect(b?.detail).toContain("don't have an author seat");
  });
});
