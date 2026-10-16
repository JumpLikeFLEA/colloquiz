import { describe, expect, it } from "vitest";
import {
  JOIN_TOKEN_PATTERN,
  joinPath,
  linkStatement,
  parseJoinLinkState,
  parseTeacherJoinPreview,
  statementLead,
  toLinkedStudent,
  toMyTeacher,
} from "./teacherLinks";

const TOKEN = "0123456789abcdef0123456789abcdef";

describe("join token shape", () => {
  it("accepts 32 lowercase hex and nothing else", () => {
    expect(JOIN_TOKEN_PATTERN.test(TOKEN)).toBe(true);
    expect(JOIN_TOKEN_PATTERN.test(TOKEN.toUpperCase())).toBe(false);
    expect(JOIN_TOKEN_PATTERN.test(TOKEN + "0")).toBe(false);
    expect(JOIN_TOKEN_PATTERN.test("../" + TOKEN.slice(3))).toBe(false);
    expect(JOIN_TOKEN_PATTERN.test("")).toBe(false);
  });
  it("builds the join path", () => {
    expect(joinPath(TOKEN)).toBe(`/join/${TOKEN}`);
  });
});

describe("parseTeacherJoinPreview", () => {
  it("maps each known state with the teacher's name", () => {
    for (const state of ["ok", "self", "already_linked"] as const) {
      expect(parseTeacherJoinPreview({ state, teacher_name: "Anna" })).toEqual({ state, teacherName: "Anna" });
    }
  });
  it("reads anything unrecognised as not_found", () => {
    expect(parseTeacherJoinPreview(null)).toEqual({ state: "not_found" });
    expect(parseTeacherJoinPreview("ok")).toEqual({ state: "not_found" });
    expect(parseTeacherJoinPreview({ state: "not_found" })).toEqual({ state: "not_found" });
    expect(parseTeacherJoinPreview({ state: "ok" })).toEqual({ state: "not_found" });
    expect(parseTeacherJoinPreview({ state: "ok", teacher_name: "  " })).toEqual({ state: "not_found" });
    expect(parseTeacherJoinPreview({ state: "weird", teacher_name: "A" })).toEqual({ state: "not_found" });
  });
});

describe("row mappers", () => {
  it("maps my_teachers rows", () => {
    expect(toMyTeacher({ link_id: "l", teacher_name: "Anna", linked_at: "2026-10-16T00:00:00Z" })).toEqual({
      linkId: "l",
      teacherName: "Anna",
      linkedAt: "2026-10-16T00:00:00Z",
    });
  });
  it("maps teacher_linked_students rows, defaulting a missing label and unknown source", () => {
    expect(
      toLinkedStudent({ link_id: "l", user_id: "u", contact_label: null, source: "run_invite", linked_at: "t" }),
    ).toEqual({ linkId: "l", userId: "u", label: "", source: "run_invite", linkedAt: "t" });
    expect(toLinkedStudent({ link_id: "l", user_id: "u", contact_label: "a@b.c", source: "x", linked_at: "t" }).source).toBe(
      "join_link",
    );
  });
  it("parses the join-link state, null for a non-teacher", () => {
    expect(parseJoinLinkState(null)).toBeNull();
    expect(parseJoinLinkState({ exists: true, rotated_at: "t" })).toEqual({ exists: true, rotatedAt: "t" });
    expect(parseJoinLinkState({ exists: false, rotated_at: null })).toEqual({ exists: false, rotatedAt: null });
  });
});

describe("linkStatement", () => {
  it("has the same bullets in both languages, none empty", () => {
    expect(linkStatement.ru.sees).toHaveLength(linkStatement.en.sees.length);
    for (const lang of ["en", "ru"] as const) {
      for (const line of [...linkStatement[lang].sees, linkStatement[lang].cannot, linkStatement[lang].leave]) {
        expect(line.trim().length).toBeGreaterThan(0);
      }
    }
  });
  it("names the teacher in the lead", () => {
    expect(statementLead("en", "Anna")).toContain("Anna");
    expect(statementLead("ru", "Анна")).toContain("Анна");
    expect(statementLead("en", "Anna")).not.toContain("{teacher}");
  });
});
