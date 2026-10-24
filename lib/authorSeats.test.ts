import { describe, expect, it } from "vitest";
import { expiryFromDateInput, extendedDate, importHint, localDateString, seatState, toSeatRow } from "./authorSeats";

describe("toSeatRow", () => {
  it("maps an author_seats_list row to the app's field names", () => {
    expect(
      toSeatRow({
        user_id: "u1",
        contact: "t@example.com",
        kind: "house",
        public_name: "Anna",
        notes: "paid in October",
        expires_at: "2027-01-01T00:00:00Z",
        created_at: "2026-10-01T00:00:00Z",
        is_active: true,
        days_left: 77,
        courses: 3,
        linked_students: 12,
        can_import: true,
      }),
    ).toEqual({
      userId: "u1",
      contact: "t@example.com",
      kind: "house",
      publicName: "Anna",
      notes: "paid in October",
      expiresAt: "2027-01-01T00:00:00Z",
      createdAt: "2026-10-01T00:00:00Z",
      isActive: true,
      daysLeft: 77,
      courses: 3,
      linkedStudents: 12,
      canImport: true,
    });
  });

  it("keeps nulls and defaults an unknown kind to teacher", () => {
    const row = toSeatRow({ user_id: "u2", kind: "owner", public_name: "B", created_at: "x", is_active: false });
    expect(row).toMatchObject({ kind: "teacher", notes: null, expiresAt: null, daysLeft: null, isActive: false, courses: 0, linkedStudents: 0, canImport: false });
  });
});

describe("seatState", () => {
  it("an open-ended active seat", () => {
    expect(seatState({ isActive: true, expiresAt: null, daysLeft: null })).toEqual({ tone: "open", label: "Active · no expiry" });
  });

  it("an active seat far from its end", () => {
    expect(seatState({ isActive: true, expiresAt: "2027-01-01T00:00:00Z", daysLeft: 30 })).toEqual({
      tone: "active",
      label: "Active · expires in 30 days",
    });
  });

  it("flags the last week, and says 1 day in the singular", () => {
    expect(seatState({ isActive: true, expiresAt: "x", daysLeft: 7 }).tone).toBe("soon");
    expect(seatState({ isActive: true, expiresAt: "x", daysLeft: 8 }).tone).toBe("active");
    expect(seatState({ isActive: true, expiresAt: "x", daysLeft: 1 }).label).toBe("Active · expires in 1 day");
  });

  it("follows is_active, not the date: a lapsed seat is lapsed whatever days_left says", () => {
    expect(seatState({ isActive: false, expiresAt: "2026-09-01T00:00:00Z", daysLeft: -40 })).toEqual({ tone: "lapsed", label: "Lapsed" });
    expect(seatState({ isActive: false, expiresAt: "2999-01-01T00:00:00Z", daysLeft: 99999 }).tone).toBe("lapsed");
  });
});

describe("extendedDate", () => {
  const now = new Date(2026, 9, 16, 12, 0, 0); // 16 Oct 2026, local

  it("counts from today for an open-ended or lapsed seat", () => {
    expect(extendedDate({ isActive: true, expiresAt: null }, 3, now)).toBe("2027-01-16");
    expect(extendedDate({ isActive: false, expiresAt: new Date(2026, 5, 1).toISOString() }, 1, now)).toBe("2026-11-16");
  });

  it("counts from the current expiry when it is still ahead", () => {
    expect(extendedDate({ isActive: true, expiresAt: new Date(2026, 11, 20, 23, 59, 59).toISOString() }, 1, now)).toBe("2027-01-20");
  });

  it("clamps to the end of a shorter month", () => {
    const jan31 = new Date(2027, 0, 31, 12);
    expect(extendedDate({ isActive: true, expiresAt: null }, 1, jan31)).toBe("2027-02-28");
    expect(extendedDate({ isActive: true, expiresAt: null }, 12, new Date(2027, 1, 28, 12))).toBe("2028-02-28");
  });
});

describe("expiryFromDateInput", () => {
  it("is the end of that local day", () => {
    const iso = expiryFromDateInput("2026-12-31");
    expect(iso).not.toBeNull();
    const d = new Date(iso as string);
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 11, 31, 23, 59]);
  });

  it("round-trips through localDateString", () => {
    expect(localDateString(new Date(expiryFromDateInput("2027-03-05") as string))).toBe("2027-03-05");
  });

  it("rejects empty, malformed and impossible dates", () => {
    expect(expiryFromDateInput("")).toBeNull();
    expect(expiryFromDateInput("31/12/2026")).toBeNull();
    expect(expiryFromDateInput("2026-02-31")).toBeNull();
  });
});

describe("importHint", () => {
  it("says what the switch does, and warns when a granted seat has lapsed", () => {
    expect(importHint({ canImport: false, isActive: true })).toBe("Can't import a course from a file.");
    expect(importHint({ canImport: true, isActive: true })).toMatch(/^Can import a course/);
    expect(importHint({ canImport: true, isActive: false })).toMatch(/lapsed/);
  });

  it("an ungranted lapsed seat is just not allowed", () => {
    expect(importHint({ canImport: false, isActive: false })).toBe("Can't import a course from a file.");
  });
});

describe("toSeatRow canImport", () => {
  it("is true only for a literal true", () => {
    expect(toSeatRow({ user_id: "u", created_at: "x", can_import: "true" }).canImport).toBe(false);
    expect(toSeatRow({ user_id: "u", created_at: "x" }).canImport).toBe(false);
    expect(toSeatRow({ user_id: "u", created_at: "x", can_import: true }).canImport).toBe(true);
  });
});
