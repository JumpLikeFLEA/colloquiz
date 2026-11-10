import { describe, expect, it } from "vitest";
import {
  editedAfterDraft,
  matchesWritingStatus,
  parseWritingFilters,
  reviewsNav,
  toWritingReviewRow,
  writingFiltersQuery,
  writingWaitingCount,
  writingWaitingGroups,
  type WritingReviewRow,
} from "./review";

const C1 = "11111111-1111-4111-8111-111111111111";
const C2 = "22222222-2222-4222-8222-222222222222";

function row(over: Partial<Record<string, unknown>> = {}): WritingReviewRow {
  return toWritingReviewRow({
    submission_id: "s1",
    route: "cohort",
    course_id: C1,
    course_title: "Course A",
    user_id: "u1",
    learner_label: "Maria",
    lesson_id: "l1",
    lesson_title: "L",
    lesson_ordinal: 1,
    block_id: "b1",
    body: "text",
    submitted_at: "2026-11-01T10:00:00Z",
    updated_at: "2026-11-01T10:00:00Z",
    status: "waiting",
    ...over,
  });
}

describe("reviewsNav", () => {
  it("opens recordings while one waits, even when written answers wait too", () => {
    expect(reviewsNav(2, 3)).toEqual({ href: "/studio/reviews", badge: 5 });
  });
  it("opens written answers when only they wait", () => {
    expect(reviewsNav(0, 3)).toEqual({ href: "/studio/writing", badge: 3 });
  });
  it("opens AI feedback when nothing waits, with a zero badge", () => {
    expect(reviewsNav(0, 0)).toEqual({ href: "/studio/voice", badge: 0 });
  });
  it("treats a failed (null) count as nothing waiting there, and keeps the other's badge", () => {
    expect(reviewsNav(null, 4)).toEqual({ href: "/studio/writing", badge: 4 });
    expect(reviewsNav(2, null)).toEqual({ href: "/studio/reviews", badge: 2 });
  });
  it("hides the badge only when both reads failed", () => {
    expect(reviewsNav(null, null)).toEqual({ href: "/studio/voice", badge: null });
  });
});

describe("filters", () => {
  it("defaults, allow-lists and round-trips", () => {
    expect(parseWritingFilters({})).toEqual({ course: null, status: "to_review" });
    expect(parseWritingFilters({ course: "nope", status: "bogus" })).toEqual({ course: null, status: "to_review" });
    const f = parseWritingFilters({ course: C1.toUpperCase(), status: "waiting" });
    expect(f).toEqual({ course: C1, status: "waiting" });
    expect(writingFiltersQuery(f)).toBe(`?course=${C1}&status=waiting`);
    expect(writingFiltersQuery({ course: null, status: "to_review" })).toBe("");
  });
  it("to_review is waiting + draft", () => {
    expect(matchesWritingStatus("waiting", "to_review")).toBe(true);
    expect(matchesWritingStatus("draft", "to_review")).toBe(true);
    expect(matchesWritingStatus("answered", "to_review")).toBe(false);
    expect(matchesWritingStatus("answered", "all")).toBe(true);
  });
});

describe("rows", () => {
  it("counts and groups only waiting answers, oldest group first", () => {
    const rows = [
      row({ submission_id: "a", submitted_at: "2026-11-03T00:00:00Z" }),
      row({ submission_id: "b", course_id: C2, course_title: "Course B", submitted_at: "2026-11-02T00:00:00Z" }),
      row({ submission_id: "c", submitted_at: "2026-11-01T00:00:00Z" }),
      row({ submission_id: "d", status: "draft" }),
      row({ submission_id: "e", status: "answered" }),
    ];
    expect(writingWaitingCount(rows)).toBe(3);
    const groups = writingWaitingGroups(rows);
    expect(groups.map((g) => [g.courseId, g.count, g.oldestAt])).toEqual([
      [C1, 2, "2026-11-01T00:00:00Z"],
      [C2, 1, "2026-11-02T00:00:00Z"],
    ]);
    expect(groups[0].href).toBe(`/studio/writing?course=${C1}&status=waiting`);
  });
  it("flags an answer edited after the teacher's draft, never an untouched one", () => {
    const edited = row({ status: "draft", updated_at: "2026-11-05T00:00:00Z", feedback_updated_at: "2026-11-04T00:00:00Z" });
    const same = row({ status: "draft", updated_at: "2026-11-04T00:00:00Z", feedback_updated_at: "2026-11-04T00:00:00Z" });
    expect(editedAfterDraft(edited)).toBe(true);
    expect(editedAfterDraft(same)).toBe(false);
    expect(editedAfterDraft(row())).toBe(false);
  });
  it("falls back to a label when the learner has none", () => {
    expect(row({ learner_label: "  " }).learnerLabel).toBe("Learner");
  });
});
