import { describe, expect, it } from "vitest";
import {
  GROUP_NAME_MAX,
  groupErrorMessage,
  groupsByStudent,
  membersByGroup,
  normalizeGroupName,
  toTeacherGroup,
} from "./teacherGroups";

describe("normalizeGroupName", () => {
  it("trims", () => expect(normalizeGroupName("  Evening class ")).toBe("Evening class"));
  it("rejects empty and whitespace", () => {
    expect(normalizeGroupName("")).toBeNull();
    expect(normalizeGroupName("   ")).toBeNull();
  });
  it("accepts exactly the max and rejects one over", () => {
    expect(normalizeGroupName("a".repeat(GROUP_NAME_MAX))).not.toBeNull();
    expect(normalizeGroupName("a".repeat(GROUP_NAME_MAX + 1))).toBeNull();
  });
});

describe("membership lookups", () => {
  const rows = [
    { group_id: "g1", student_id: "s1" },
    { group_id: "g1", student_id: "s2" },
    { group_id: "g2", student_id: "s1" },
  ];
  it("indexes by group", () => {
    const m = membersByGroup(rows);
    expect([...m.get("g1")!].sort()).toEqual(["s1", "s2"]);
    expect([...m.get("g2")!]).toEqual(["s1"]);
    expect(m.get("g3")).toBeUndefined();
  });
  it("indexes by student (several groups per student)", () => {
    const m = groupsByStudent(rows);
    expect([...m.get("s1")!].sort()).toEqual(["g1", "g2"]);
    expect([...m.get("s2")!]).toEqual(["g1"]);
  });
  it("is empty for no rows", () => {
    expect(membersByGroup([]).size).toBe(0);
    expect(groupsByStudent([]).size).toBe(0);
  });
});

describe("toTeacherGroup / groupErrorMessage", () => {
  it("maps a raw row, count as a number", () => {
    expect(toTeacherGroup({ group_id: "g", name: "A", member_count: "3" as unknown as number, created_at: "t" })).toEqual({
      id: "g",
      name: "A",
      memberCount: 3,
      createdAt: "t",
    });
  });
  it("names the known codes and falls back for an unknown one", () => {
    expect(groupErrorMessage("name_taken")).toMatch(/already have/);
    expect(groupErrorMessage("not_linked")).toMatch(/linked/);
    expect(groupErrorMessage("zzz")).toBe("Something went wrong.");
  });
});
