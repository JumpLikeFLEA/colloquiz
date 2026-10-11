import { describe, expect, it } from "vitest";
import {
  countLearners,
  learnerFiltersQuery,
  parseLearnerFilters,
  rosterFilterOptions,
  scopeRoster,
  toRosterRow,
  type RosterRow,
} from "./roster";

const A = "4651bdf0-945b-4e68-be50-1e51c6ca75af";
const B = "881395e3-2a20-429f-9f04-5b8c94ca83d9";
const RUN_A1 = "11111111-1111-4111-8111-111111111111";
const RUN_A2 = "33333333-3333-4333-8333-333333333333";
const RUN_B = "22222222-2222-4222-8222-222222222222";

function row(over: Partial<RosterRow>): RosterRow {
  return {
    courseId: A,
    courseTitle: "Course A",
    userId: "u1",
    learnerEmail: "a@example.test",
    enrolmentId: null,
    runId: null,
    runTitle: null,
    runStartsAt: null,
    tier: null,
    enrolmentRevokedAt: null,
    inviteeName: null,
    inviteeContact: null,
    acquisitionSource: null,
    acquisitionCourseId: null,
    acquisitionCourseTitle: null,
    lessonsTotal: 5,
    lessonsOpened: 0,
    lessonsCompleted: 0,
    lastActivityAt: null,
    voicesSent: 0,
    voicesAnswered: 0,
    ...over,
  };
}

describe("parseLearnerFilters", () => {
  it("keeps UUIDs, lower-cased", () => {
    expect(parseLearnerFilters({ course: A.toUpperCase(), run: RUN_A1 })).toEqual({ course: A, run: RUN_A1 });
  });

  it("drops anything that isn't a UUID", () => {
    expect(parseLearnerFilters({ course: "x'; drop", run: ["nope", RUN_A1] })).toEqual({ course: null, run: null });
    expect(parseLearnerFilters({})).toEqual({ course: null, run: null });
  });

  it("takes the first of a repeated param", () => {
    expect(parseLearnerFilters({ course: [A, B] }).course).toBe(A);
  });
});

describe("learnerFiltersQuery", () => {
  it("drops empty filters", () => {
    expect(learnerFiltersQuery({ course: null, run: null })).toBe("");
    expect(learnerFiltersQuery({ course: A, run: null })).toBe(`?course=${A}`);
    expect(learnerFiltersQuery({ course: A, run: RUN_A1 })).toBe(`?course=${A}&run=${RUN_A1}`);
  });

  it("round-trips through parseLearnerFilters", () => {
    const q = new URLSearchParams(learnerFiltersQuery({ course: A, run: RUN_A1 }));
    expect(parseLearnerFilters(Object.fromEntries(q))).toEqual({ course: A, run: RUN_A1 });
  });
});

describe("scopeRoster", () => {
  const rows = [
    row({ userId: "u1", runId: RUN_A1, enrolmentId: "e1" }),
    row({ userId: "u2" }),
    row({ userId: "u3", courseId: B, courseTitle: "Course B", runId: RUN_B, enrolmentId: "e3" }),
  ];

  it("no filter keeps every row", () => {
    expect(scopeRoster(rows, { course: null, run: null })).toHaveLength(3);
  });

  it("course filter keeps that course's rows, enrolled or not", () => {
    expect(scopeRoster(rows, { course: A, run: null }).map((r) => r.userId)).toEqual(["u1", "u2"]);
  });

  it("run filter keeps only that run's enrolment rows", () => {
    expect(scopeRoster(rows, { course: null, run: RUN_A1 }).map((r) => r.userId)).toEqual(["u1"]);
  });

  it("a run from another course than the course filter matches nothing", () => {
    expect(scopeRoster(rows, { course: A, run: RUN_B })).toEqual([]);
  });
});

describe("rosterFilterOptions", () => {
  const rows = [
    row({ runId: RUN_A2, runTitle: "November", runStartsAt: "2026-11-01T00:00:00Z", enrolmentId: "e2" }),
    row({ runId: RUN_A1, runTitle: "October", runStartsAt: "2026-10-01T00:00:00Z", enrolmentId: "e1" }),
    row({ userId: "u9" }),
    row({ courseId: B, courseTitle: "Basics", runId: RUN_B, runStartsAt: "2026-09-01T00:00:00Z", enrolmentId: "e3" }),
  ];

  it("lists courses by title and runs by start, skipping rows with no run", () => {
    const o = rosterFilterOptions(rows, null);
    expect(o.courses.map((c) => c.title)).toEqual(["Basics", "Course A"]);
    expect(o.runs.map((r) => r.id)).toEqual([RUN_B, RUN_A1, RUN_A2]);
  });

  it("runs follow the course filter; courses don't", () => {
    const o = rosterFilterOptions(rows, A);
    expect(o.courses).toHaveLength(2);
    expect(o.runs.map((r) => r.id)).toEqual([RUN_A1, RUN_A2]);
  });

  it("is empty for no rows", () => {
    expect(rosterFilterOptions([], null)).toEqual({ courses: [], runs: [] });
  });
});

describe("countLearners", () => {
  it("counts people, not rows", () => {
    const rows = [
      row({ userId: "u1", runId: RUN_A1 }),
      row({ userId: "u1", runId: RUN_A2 }),
      row({ userId: "u1", courseId: B }),
      row({ userId: "u2" }),
    ];
    expect(countLearners(rows)).toBe(2);
    expect(countLearners([])).toBe(0);
  });
});

describe("toRosterRow", () => {
  it("maps snake_case and nulls, and coerces counts", () => {
    const r = toRosterRow({
      course_id: A,
      course_title: "Course A",
      user_id: "u1",
      learner_email: "a@example.test",
      enrolment_id: null,
      run_id: null,
      acquisition_source: "instagram",
      acquisition_course_id: A,
      acquisition_course_title: "Course A",
      lessons_total: 5,
      lessons_opened: "3",
      lessons_completed: 2,
      last_activity_at: "2026-10-10T10:00:00Z",
      voices_sent: 0,
      voices_answered: null,
    });
    expect(r).toMatchObject({
      runId: null,
      runTitle: null,
      tier: null,
      inviteeContact: null,
      acquisitionSource: "instagram",
      lessonsOpened: 3,
      lessonsCompleted: 2,
      voicesAnswered: 0,
    });
  });
});
