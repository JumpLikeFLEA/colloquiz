import { describe, expect, it } from "vitest";
import { PLAN } from "./__fixtures__/lesson";
import { failureMessage, importStatusView, type ImportStatusRow } from "./status";

const base: ImportStatusRow = {
  status: "pending",
  plan: null,
  lessons_done: 0,
  qa: null,
  course_id: null,
  failure: null,
  created_at: "2026-10-24T10:00:00Z",
  updated_at: "2026-10-24T10:00:00Z",
  finished_at: null,
};

const states = (row: Partial<ImportStatusRow>) => importStatusView({ ...base, ...row }).steps.map((s) => `${s.key}:${s.state}`);

describe("importStatusView", () => {
  it("pending is reading the file", () => {
    expect(states({})).toEqual(["reading:active", "planning:todo", "drafting:todo", "saving:todo"]);
  });

  it("planning has read the file", () => {
    expect(states({ status: "planning" })).toEqual(["reading:done", "planning:active", "drafting:todo", "saving:todo"]);
  });

  it("drafting names the lesson in progress, k of n", () => {
    const v = importStatusView({ ...base, status: "drafting", plan: PLAN, lessons_done: 1 });
    expect(v.steps.map((s) => `${s.key}:${s.state}`)).toEqual(["reading:done", "planning:done", "drafting:active", "saving:todo"]);
    expect(v.steps[2].label).toBe("Lesson 2 of 2");
    expect(v.lessonsDone).toBe(1);
    expect(v.lessonsTotal).toBe(2);
  });

  it("never shows a lesson number past the total", () => {
    const v = importStatusView({ ...base, status: "committing", plan: PLAN, lessons_done: 2 });
    expect(v.steps[2].label).toBe("Lesson 2 of 2");
    expect(v.steps.map((s) => s.state)).toEqual(["done", "done", "done", "active"]);
  });

  it("without a plan the drafting step has no count to show", () => {
    expect(importStatusView(base).steps[2].label).toBe("Drafting lessons");
  });

  it("done marks everything done and hands over the QA report and the course", () => {
    const qa = { markMapping: null, planNotes: [], flags: [], lessons: [] };
    const v = importStatusView({ ...base, status: "done", plan: PLAN, lessons_done: 2, qa, course_id: "c-1" });
    expect(v.state).toBe("done");
    expect(v.steps.every((s) => s.state === "done")).toBe(true);
    expect(v.qa).toEqual(qa);
    expect(v.courseId).toBe("c-1");
  });

  it("a running import hands over neither the QA report nor a course", () => {
    const v = importStatusView({ ...base, status: "drafting", plan: PLAN, qa: { x: 1 }, course_id: "c-1" });
    expect(v.qa).toBeNull();
    expect(v.courseId).toBeNull();
  });

  it("a failure keeps what finished and carries its reason", () => {
    const v = importStatusView({ ...base, status: "failed", plan: PLAN, lessons_done: 1, failure: "llm_refusal" });
    expect(v.state).toBe("failed");
    expect(v.steps.map((s) => s.state)).toEqual(["done", "done", "todo", "todo"]);
    expect(v.failure).toEqual({ code: "llm_refusal", message: failureMessage("llm_refusal") });
    expect(v.qa).toBeNull();
  });

  it("a failure before the plan marks nothing done", () => {
    expect(importStatusView({ ...base, status: "failed", failure: "empty_file" }).steps.map((s) => s.state)).toEqual([
      "todo",
      "todo",
      "todo",
      "todo",
    ]);
  });
});

describe("failureMessage", () => {
  it("has a sentence for every code the pipeline writes", () => {
    const codes = [
      "mode_off", "empty_file", "file_too_long", "object_missing", "docx_unreadable", "llm_refusal", "llm_max_tokens",
      "llm_network", "plan_invalid", "invalid_course", "slug_taken", "forbidden", "seat_lapsed", "timeout", "file_expired",
      "lesson_invalid:why-two-tenses", "llm_http_400",
    ];
    const generic = failureMessage("something-new");
    for (const c of codes) expect(failureMessage(c), c).not.toBe(generic);
  });

  it("never echoes the code or any provider text", () => {
    expect(failureMessage("llm_http_400")).not.toMatch(/400/);
    expect(failureMessage("lesson_invalid:secret-slug")).not.toMatch(/secret-slug/);
  });
});
