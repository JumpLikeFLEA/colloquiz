import { describe, expect, it } from "vitest";
import {
  buildHomeworkViews,
  dueState,
  formatDueDate,
  groupAssignable,
  homeworkErrorMessage,
  homeworkForCourse,
  homeworkForGroup,
  homeworkForLesson,
  homeworkForStudent,
  homeworkHref,
  homeworkPillText,
  parseAssignInput,
  parseDueDate,
  toMyHomework,
  toTeacherHomework,
  type HomeworkListRow,
  type HomeworkProgressRow,
  type MyHomeworkRow,
} from "./homework";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const S1 = "33333333-3333-4333-8333-333333333333";
const S2 = "44444444-4444-4444-8444-444444444444";
const G1 = "55555555-5555-4555-8555-555555555555";

describe("parseDueDate", () => {
  it("accepts a real calendar day", () => {
    expect(parseDueDate("2026-10-20")).toBe("2026-10-20");
    expect(parseDueDate("2028-02-29")).toBe("2028-02-29");
  });
  it("rejects a day that does not exist, a wrong shape and a non-string", () => {
    expect(parseDueDate("2026-02-30")).toBeNull();
    expect(parseDueDate("2026-13-01")).toBeNull();
    expect(parseDueDate("20/10/2026")).toBeNull();
    expect(parseDueDate("2026-10-20T00:00:00Z")).toBeNull();
    expect(parseDueDate(20261020)).toBeNull();
  });
});

describe("formatDueDate", () => {
  const today = new Date("2026-10-16T12:00:00Z");
  it("drops the year inside the current year", () => {
    expect(formatDueDate("2026-10-20", "en-GB", today)).toBe("20 Oct");
  });
  it("keeps the year outside the current year", () => {
    expect(formatDueDate("2027-01-05", "en-GB", today)).toBe("5 Jan 2027");
  });
  it("formats the calendar day in UTC, whatever the host time zone", () => {
    expect(formatDueDate("2026-10-01", "en-GB", today)).toBe("1 Oct");
  });
  it("formats Russian", () => {
    expect(formatDueDate("2026-10-20", "ru-RU", today)).toMatch(/^20 окт/);
  });
});

describe("dueState", () => {
  const today = new Date("2026-10-16T23:30:00Z");
  it("has none without a date", () => expect(dueState(null, today)).toBe("none"));
  it("counts today as upcoming", () => expect(dueState("2026-10-16", today)).toBe("upcoming"));
  it("is upcoming before the day and past after it", () => {
    expect(dueState("2026-10-17", today)).toBe("upcoming");
    expect(dueState("2026-10-15", today)).toBe("past");
  });
});

describe("homeworkErrorMessage", () => {
  it("names every code 080 returns", () => {
    for (const code of [
      "forbidden",
      "course_not_found",
      "lesson_not_found",
      "invalid_note",
      "no_targets",
      "too_many",
      "not_linked",
      "group_not_found",
      "not_found",
      "seat_lapsed",
    ]) {
      expect(homeworkErrorMessage(code)).not.toBe("Something went wrong.");
    }
  });
  it("falls back for an unknown code", () => {
    expect(homeworkErrorMessage("nope")).toBe("Something went wrong.");
  });
});

describe("parseAssignInput", () => {
  const ok = { courseId: A, lessonId: B, dueOn: "2026-10-20", note: "  hi ", studentIds: [S1, S1], groupIds: [G1] };
  it("accepts a full body, trims the note and de-duplicates ids", () => {
    const r = parseAssignInput(ok);
    expect(r).toEqual({
      ok: true,
      input: { courseId: A, lessonId: B, dueOn: "2026-10-20", note: "hi", studentIds: [S1], groupIds: [G1] },
    });
  });
  it("treats a missing lesson, date and note as null", () => {
    const r = parseAssignInput({ courseId: A, studentIds: [S1] });
    expect(r).toEqual({ ok: true, input: { courseId: A, lessonId: null, dueOn: null, note: null, studentIds: [S1], groupIds: [] } });
  });
  it("treats an empty date and a blank note as null", () => {
    const r = parseAssignInput({ courseId: A, dueOn: "", note: "   ", studentIds: [S1] });
    expect(r.ok && r.input.dueOn).toBeNull();
    expect(r.ok && r.input.note).toBeNull();
  });
  it("rejects each malformed field", () => {
    expect(parseAssignInput({ ...ok, courseId: "x" }).ok).toBe(false);
    expect(parseAssignInput({ ...ok, lessonId: "x" }).ok).toBe(false);
    expect(parseAssignInput({ ...ok, dueOn: "2026-02-30" }).ok).toBe(false);
    expect(parseAssignInput({ ...ok, note: "x".repeat(501) }).ok).toBe(false);
    expect(parseAssignInput({ ...ok, note: 5 }).ok).toBe(false);
    expect(parseAssignInput({ ...ok, studentIds: ["x"] }).ok).toBe(false);
    expect(parseAssignInput({ ...ok, groupIds: "x" }).ok).toBe(false);
  });
  it("rejects a body with no target", () => {
    const r = parseAssignInput({ courseId: A, studentIds: [], groupIds: [] });
    expect(r).toEqual({ ok: false, error: "Choose at least one student or group." });
  });
  it("accepts a note of exactly 500 characters", () => {
    expect(parseAssignInput({ ...ok, note: "x".repeat(500) }).ok).toBe(true);
  });
});

const listRow = (over: Partial<HomeworkListRow> = {}): HomeworkListRow => ({
  assignment_id: "a1",
  course_id: A,
  course_title: "Course",
  course_slug: "course",
  course_published: true,
  lesson_id: null,
  lesson_title: null,
  due_on: null,
  note: null,
  created_at: "2026-10-16T10:00:00Z",
  ...over,
});
const prog = (over: Partial<HomeworkProgressRow>): HomeworkProgressRow => ({
  assignment_id: "a1",
  student_id: S1,
  done_lessons: 0,
  total_lessons: 2,
  done: false,
  best_percent: null,
  last_activity_at: null,
  ...over,
});

describe("buildHomeworkViews", () => {
  const labels: Record<string, string> = { [S1]: "Zoe", [S2]: "Adam" };
  const labelOf = (id: string) => labels[id] ?? id;

  it("joins targets and progress per assignment and counts done", () => {
    const views = buildHomeworkViews(
      [toTeacherHomework(listRow()), toTeacherHomework(listRow({ assignment_id: "a2", lesson_id: B, lesson_title: "L" }))],
      [
        { assignment_id: "a1", student_id: S1, group_id: null },
        { assignment_id: "a1", student_id: null, group_id: G1 },
        { assignment_id: "a2", student_id: S2, group_id: null },
      ],
      [
        prog({ student_id: S1, done: true, done_lessons: 2 }),
        prog({ student_id: S2 }),
        prog({ assignment_id: "a2", student_id: S2, total_lessons: 1 }),
      ],
      labelOf,
    );
    expect(views).toHaveLength(2);
    expect(views[0].studentIds).toEqual([S1]);
    expect(views[0].groupIds).toEqual([G1]);
    expect(views[0].recipients).toHaveLength(2);
    expect(views[0].doneCount).toBe(1);
    expect(views[1].studentIds).toEqual([S2]);
    expect(views[1].doneCount).toBe(0);
  });

  it("lists not-done recipients first, then by label", () => {
    const [v] = buildHomeworkViews(
      [toTeacherHomework(listRow())],
      [],
      [prog({ student_id: S1, done: true }), prog({ student_id: S2 })],
      labelOf,
    );
    expect(v.recipients.map((r) => r.studentId)).toEqual([S2, S1]);
  });

  it("gives an assignment with no progress rows an empty recipient list", () => {
    const [v] = buildHomeworkViews([toTeacherHomework(listRow())], [], [], labelOf);
    expect(v.recipients).toEqual([]);
    expect(v.doneCount).toBe(0);
  });

  it("filters by student, group and course", () => {
    const views = buildHomeworkViews(
      [toTeacherHomework(listRow()), toTeacherHomework(listRow({ assignment_id: "a2", course_id: B }))],
      [
        { assignment_id: "a1", student_id: null, group_id: G1 },
        { assignment_id: "a2", student_id: S2, group_id: null },
      ],
      [prog({ student_id: S1 }), prog({ assignment_id: "a2", student_id: S2 })],
      labelOf,
    );
    expect(homeworkForStudent(views, S1).map((v) => v.id)).toEqual(["a1"]);
    expect(homeworkForStudent(views, S2).map((v) => v.id)).toEqual(["a2"]);
    expect(homeworkForStudent(views, "nobody")).toEqual([]);
    expect(homeworkForGroup(views, G1).map((v) => v.id)).toEqual(["a1"]);
    expect(homeworkForCourse(views, B).map((v) => v.id)).toEqual(["a2"]);
  });
});

describe("groupAssignable", () => {
  it("groups flat rows into courses, keeping order", () => {
    const rows = [
      { course_id: A, course_title: "A", course_slug: "a", course_edited: true, lesson_id: "l1", lesson_title: "One", lesson_ordinal: 1 },
      { course_id: A, course_title: "A", course_slug: "a", course_edited: true, lesson_id: "l2", lesson_title: "Two", lesson_ordinal: 2 },
      { course_id: B, course_title: "B", course_slug: "b", course_edited: false, lesson_id: "l3", lesson_title: "Three", lesson_ordinal: 1 },
    ];
    const out = groupAssignable(rows);
    expect(out.map((c) => [c.title, c.edited, c.lessons.length])).toEqual([
      ["A", true, 2],
      ["B", false, 1],
    ]);
  });
  it("is empty for no rows", () => expect(groupAssignable([])).toEqual([]));
});

const myRow = (over: Partial<MyHomeworkRow> = {}): MyHomeworkRow => ({
  assignment_id: "h1",
  teacher_name: "Ann",
  course_id: A,
  course_slug: "course",
  course_title: "Course",
  lesson_id: null,
  lesson_slug: null,
  lesson_title: null,
  due_on: null,
  note: null,
  created_at: "2026-10-16T10:00:00Z",
  done: false,
  done_lessons: 0,
  total_lessons: 3,
  state: null,
  opens_at: null,
  ...over,
});

describe("toMyHomework / homeworkHref", () => {
  it("maps a course row and links to the course", () => {
    const h = toMyHomework(myRow());
    expect(h.access).toBeNull();
    expect(homeworkHref(h)).toBe("/courses/course");
  });
  it("maps a lesson row with its access state and links to the lesson", () => {
    const h = toMyHomework(myRow({ lesson_id: B, lesson_slug: "l1", lesson_title: "L", state: "scheduled", opens_at: "2026-11-01T00:00:00Z" }));
    expect(h.access).toBe("scheduled");
    expect(h.opensAt).toBe("2026-11-01T00:00:00Z");
    expect(homeworkHref(h)).toBe("/courses/course/l1");
  });
  it("drops a state it does not know instead of inventing one", () => {
    expect(toMyHomework(myRow({ lesson_id: B, state: "weird" })).access).toBeNull();
  });
});

describe("homeworkForLesson", () => {
  const rows = [
    toMyHomework(myRow({ assignment_id: "course-done", done: true, due_on: "2026-10-01" })),
    toMyHomework(myRow({ assignment_id: "course-late", due_on: "2026-12-01", created_at: "2026-10-10T00:00:00Z" })),
    toMyHomework(myRow({ assignment_id: "lesson-soon", lesson_id: B, lesson_slug: "l1", due_on: "2026-10-20" })),
    toMyHomework(myRow({ assignment_id: "other-lesson", lesson_id: "other", lesson_slug: "l2", due_on: "2026-10-18" })),
    toMyHomework(myRow({ assignment_id: "other-course", course_id: "elsewhere", due_on: "2026-10-17" })),
  ];
  it("picks the soonest not-done assignment that covers the lesson", () => {
    expect(homeworkForLesson(rows, A, "l1")?.id).toBe("lesson-soon");
  });
  it("ignores another lesson's and another course's homework", () => {
    expect(homeworkForLesson(rows, A, "unrelated")?.id).toBe("course-late");
    expect(homeworkForLesson(rows, "nothing", "l1")).toBeNull();
  });
  it("falls back to a done one when nothing is open", () => {
    expect(homeworkForLesson([rows[0]], A, "l1")?.id).toBe("course-done");
  });
  it("puts an undated assignment after dated ones", () => {
    const undated = toMyHomework(myRow({ assignment_id: "undated" }));
    expect(homeworkForLesson([undated, rows[1]], A, "l1")?.id).toBe("course-late");
  });
});

describe("homeworkPillText", () => {
  const today = new Date("2026-10-16T12:00:00Z");
  it("is plain without a date", () => expect(homeworkPillText({ dueOn: null, done: false }, today)).toBe("Homework"));
  it("shows an upcoming date", () =>
    expect(homeworkPillText({ dueOn: "2026-10-20", done: false }, today)).toBe("Homework · due 20 Oct"));
  it("says was due for a past date, never overdue", () => {
    const text = homeworkPillText({ dueOn: "2026-10-01", done: false }, today);
    expect(text).toBe("Homework · was due 1 Oct");
    expect(text.toLowerCase()).not.toContain("overdue");
  });
  it("shows a check once done, whatever the date", () => {
    expect(homeworkPillText({ dueOn: "2026-10-01", done: true }, today)).toBe("Homework ✓");
  });
});
