import { describe, expect, it } from "vitest";
import {
  filterOptions,
  learnerLabel,
  matchesStatus,
  parseReviewFilters,
  reviewFiltersQuery,
  scopeRows,
  statusGrid,
  toReviewRow,
  type ReviewRow,
} from "./queue";

const A = "4651bdf0-945b-4e68-be50-1e51c6ca75af";
const B = "881395e3-2a20-429f-9f04-5b8c94ca83d9";
const RUN_A = "11111111-1111-4111-8111-111111111111";
const RUN_B = "22222222-2222-4222-8222-222222222222";

function row(over: Partial<ReviewRow>): ReviewRow {
  return {
    courseId: A,
    courseTitle: "Course A",
    runId: RUN_A,
    runTitle: "October",
    runStartsAt: "2026-10-01T00:00:00Z",
    runEndsAt: "2026-10-29T00:00:00Z",
    enrolmentId: "e1",
    tier: "basic",
    userId: "u1",
    learnerEmail: "a@example.test",
    inviteeName: null,
    inviteeContact: null,
    lessonId: "l1",
    lessonTitle: "Lesson 1",
    lessonOrdinal: 1,
    week: 1,
    opensAt: "2026-10-01T00:00:00Z",
    blockId: "v1",
    blockPrompt: null,
    blockMaxSeconds: 180,
    submissionId: null,
    submittedAt: null,
    recordingRemoved: false,
    feedbackBody: null,
    feedbackUpdatedAt: null,
    feedbackPublishedAt: null,
    status: "not_sent",
    ...over,
  };
}

describe("parseReviewFilters", () => {
  it("reads valid params", () => {
    expect(parseReviewFilters({ course: A, run: RUN_A, week: "2", status: "answered" })).toEqual({
      course: A,
      run: RUN_A,
      week: 2,
      status: "answered",
    });
  });

  it("drops anything outside the allow-list and defaults the status to to_review", () => {
    expect(parseReviewFilters({ course: "x'; drop", run: "1", week: "0", status: "bogus" })).toEqual({
      course: null,
      run: null,
      week: null,
      status: "to_review",
    });
    expect(parseReviewFilters({ week: "53" }).week).toBeNull();
    expect(parseReviewFilters({ week: "2.5" }).week).toBeNull();
    expect(parseReviewFilters({ course: [A, B] }).course).toBe(A);
  });

  it("round-trips through reviewFiltersQuery, which drops defaults", () => {
    expect(reviewFiltersQuery({ course: A, status: "to_review" })).toBe(`?course=${A}`);
    expect(reviewFiltersQuery({})).toBe("");
    const f = parseReviewFilters({ course: A, run: RUN_A, week: "3", status: "all" });
    expect(parseReviewFilters(Object.fromEntries(new URLSearchParams(reviewFiltersQuery(f))))).toEqual(f);
  });
});

describe("matchesStatus", () => {
  it("to_review is waiting + draft; all is everything", () => {
    expect(["not_open", "not_sent", "waiting", "draft", "answered"].filter((s) => matchesStatus(s as never, "to_review"))).toEqual([
      "waiting",
      "draft",
    ]);
    expect(matchesStatus("not_open", "all")).toBe(true);
    expect(matchesStatus("answered", "answered")).toBe(true);
    expect(matchesStatus("draft", "answered")).toBe(false);
  });
});

describe("scopeRows", () => {
  const rows = [
    row({}),
    row({ week: 2 }),
    row({ courseId: B, runId: RUN_B }),
  ];
  it("narrows by course, run and week", () => {
    expect(scopeRows(rows, { course: A, run: null, week: null })).toHaveLength(2);
    expect(scopeRows(rows, { course: null, run: RUN_B, week: null })).toHaveLength(1);
    expect(scopeRows(rows, { course: null, run: null, week: 2 })).toHaveLength(1);
  });
  it("a run from another course than the course filter matches nothing", () => {
    expect(scopeRows(rows, { course: A, run: RUN_B, week: null })).toEqual([]);
  });
  it("ignores week on rows that have none (final comments)", () => {
    const comments = [{ courseId: A, runId: RUN_A }];
    expect(scopeRows(comments, { course: null, run: null, week: 3 })).toHaveLength(1);
  });
});

describe("filterOptions", () => {
  it("lists courses always, runs and weeks under the course filter", () => {
    const rows = [row({}), row({ week: 3 }), row({ courseId: B, courseTitle: "B course", runId: RUN_B, week: 5 })];
    const all = filterOptions(rows, null);
    expect(all.courses.map((c) => c.title)).toEqual(["B course", "Course A"]);
    expect(all.weeks).toEqual([1, 3, 5]);
    const a = filterOptions(rows, A);
    expect(a.courses).toHaveLength(2);
    expect(a.runs.map((r) => r.id)).toEqual([RUN_A]);
    expect(a.weeks).toEqual([1, 3]);
  });
});

describe("statusGrid", () => {
  it("one row per enrolment, one column per week (no-week last), every slot's status", () => {
    const rows = [
      row({ enrolmentId: "e2", learnerEmail: "b@example.test", week: 2, status: "waiting" }),
      row({ enrolmentId: "e1", week: 1, status: "answered" }),
      row({ enrolmentId: "e1", week: 1, blockId: "v2", status: "draft" }),
      row({ enrolmentId: "e1", week: null, status: "not_open" }),
    ];
    const g = statusGrid(rows);
    expect(g.weeks).toEqual([1, 2, null]);
    expect(g.learners.map((l) => l.label)).toEqual(["a@example.test", "b@example.test"]);
    expect(g.learners[0].cells).toEqual({ "1": ["answered", "draft"], none: ["not_open"] });
    expect(g.learners[1].cells).toEqual({ "2": ["waiting"] });
  });
  it("is empty for no rows", () => {
    expect(statusGrid([])).toEqual({ weeks: [], learners: [] });
  });
});

describe("learnerLabel / toReviewRow", () => {
  it("prefers the invite name, else the email", () => {
    expect(learnerLabel({ learnerEmail: "a@x", inviteeName: "Maria" })).toBe("Maria");
    expect(learnerLabel({ learnerEmail: "a@x", inviteeName: "  " })).toBe("a@x");
  });
  it("falls back to the @username 073 puts in learner_email for a Telegram learner", () => {
    expect(learnerLabel({ learnerEmail: "@likeflea", inviteeName: null })).toBe("@likeflea");
    expect(learnerLabel({ learnerEmail: "@likeflea", inviteeName: "Maria" })).toBe("Maria");
  });
  it("maps the RPC's snake_case row", () => {
    const r = toReviewRow({
      course_id: A, course_title: "A", run_id: RUN_A, run_title: null, run_starts_at: "s", run_ends_at: "e",
      enrolment_id: "e1", tier: "basic", user_id: "u1", learner_email: "a@x", invitee_name: "M", invitee_contact: "@m",
      lesson_id: "l1", lesson_title: "L", lesson_ordinal: 2, week: null, opens_at: "o", block_id: "v1",
      block_prompt: [{ text: "Say" }], block_max_seconds: 90, submission_id: "s1", submitted_at: "t",
      recording_removed: true, feedback_body: null, feedback_updated_at: null, feedback_published_at: null, status: "waiting",
    });
    expect(r).toMatchObject({ runTitle: null, week: null, inviteeContact: "@m", recordingRemoved: true, status: "waiting" });
  });
});
