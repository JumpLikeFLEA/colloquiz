import { describe, expect, it } from "vitest";
import { grantAction, grantErrorMessage, grantStateNote, toGrantableCourse, toGrantee } from "./courseGrants";
import { SEAT_LAPSED_MESSAGE } from "./studioWriteLock";

describe("toGrantableCourse", () => {
  const row = { course_id: "c1", title: "Course", status: "published", state: "granted", granted_at: "2026-10-17T10:00:00Z" };
  it("renames the fields", () => {
    expect(toGrantableCourse(row)).toEqual({
      courseId: "c1",
      title: "Course",
      published: true,
      state: "granted",
      grantedAt: "2026-10-17T10:00:00Z",
    });
  });
  it("marks a draft as not published", () => expect(toGrantableCourse({ ...row, status: "draft" }).published).toBe(false));
  it("treats an unknown state as one the teacher cannot act on", () => {
    const course = toGrantableCourse({ ...row, state: "something_new" });
    expect(course.state).toBe("unavailable");
    expect(grantAction(course.state)).toBeNull();
  });
});

describe("grantAction", () => {
  it("offers Grant for none and revoked, Revoke for granted, nothing else", () => {
    expect(grantAction("none")).toBe("grant");
    expect(grantAction("revoked")).toBe("grant");
    expect(grantAction("granted")).toBe("revoke");
    expect(grantAction("other")).toBeNull();
    expect(grantAction("unavailable")).toBeNull();
  });
});

describe("grantStateNote", () => {
  it("explains exactly the states with no action", () => {
    for (const s of ["none", "granted", "revoked"] as const) expect(grantStateNote(s)).toBeNull();
    for (const s of ["other", "unavailable"] as const) expect(grantStateNote(s)).toMatch(/\S/);
  });
});

describe("grantErrorMessage", () => {
  it("has a sentence for every code 087 returns", () => {
    for (const code of ["forbidden", "cohort_course", "not_linked", "has_access", "not_grantable", "not_granted"]) {
      expect(grantErrorMessage(code)).not.toBe("Something went wrong.");
    }
  });
  it("uses the shared lapsed-seat message", () => expect(grantErrorMessage("seat_lapsed")).toBe(SEAT_LAPSED_MESSAGE));
  it("falls back for an unknown code", () => expect(grantErrorMessage("nope")).toBe("Something went wrong."));
});

describe("toGrantee", () => {
  it("renames the fields", () =>
    expect(toGrantee({ student_id: "s1", granted_at: "2026-10-17T10:00:00Z" })).toEqual({
      studentId: "s1",
      grantedAt: "2026-10-17T10:00:00Z",
    }));
});
