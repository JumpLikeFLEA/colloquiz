import { describe, expect, it } from "vitest";
import { compareHomework, upNext, type UpNextCall, type UpNextCourse, type UpNextHomework, type UpNextThread } from "./upNext";

const now = new Date("2026-11-02T12:00:00Z");

function thread(over: Partial<UpNextThread> = {}): UpNextThread {
  return { peerId: "t1", peerLabel: "Alina", unreadCount: 0, lastAt: "2026-11-01T10:00:00Z", ...over };
}
function hw(over: Partial<UpNextHomework> = {}): UpNextHomework {
  return {
    id: "h1",
    courseSlug: "c1",
    courseTitle: "Course one",
    lessonSlug: "l1",
    lessonTitle: "Lesson one",
    teacherName: "Alina",
    dueOn: "2026-11-05",
    createdAt: "2026-10-20T00:00:00Z",
    done: false,
    access: "open",
    ...over,
  };
}
function course(over: Partial<UpNextCourse> = {}): UpNextCourse {
  return { courseSlug: "c2", courseTitle: "Course two", continueLesson: { slug: "l3", title: "Lesson three" }, completed: 1, total: 5, ...over };
}
function call(over: Partial<UpNextCall> = {}): UpNextCall {
  return { startsAt: "2026-11-04T18:00:00Z", meetUrl: "https://meet.example/x", title: "Week 2", courseTitle: "Cohort", ...over };
}
const empty = { threads: [], homework: [], courses: [], call: null, now };

describe("upNext", () => {
  it("returns nothing when there is nothing to do", () => {
    expect(upNext(empty)).toEqual([]);
    expect(
      upNext({
        threads: [thread()],
        homework: [hw({ done: true })],
        courses: [course({ completed: 5, total: 5 }), course({ continueLesson: null })],
        call: call({ startsAt: "2026-11-20T18:00:00Z" }),
        now,
      }),
    ).toEqual([]);
  });

  it("each kind alone", () => {
    expect(upNext({ ...empty, threads: [thread({ unreadCount: 2 })] })).toEqual([
      { kind: "message", href: "/my/messages/t1", count: 2, teacherName: "Alina" },
    ]);
    expect(upNext({ ...empty, homework: [hw()] })).toEqual([
      { kind: "homework", href: "/courses/c1/l1", title: "Lesson one", courseTitle: "Course one", teacherName: "Alina", dueOn: "2026-11-05" },
    ]);
    expect(upNext({ ...empty, courses: [course()] })).toEqual([
      { kind: "continue", href: "/courses/c2/l3", lessonTitle: "Lesson three", courseTitle: "Course two" },
    ]);
    expect(upNext({ ...empty, call: call() })).toEqual([
      { kind: "call", href: "https://meet.example/x", startsAt: "2026-11-04T18:00:00Z", title: "Week 2", courseTitle: "Cohort" },
    ]);
  });

  it("ranks reply, homework, continue, call and keeps at most three", () => {
    const items = upNext({ threads: [thread({ unreadCount: 1 })], homework: [hw()], courses: [course()], call: call(), now });
    expect(items.map((i) => i.kind)).toEqual(["message", "homework", "continue"]);
    const noReply = upNext({ threads: [], homework: [hw()], courses: [course()], call: call(), now });
    expect(noReply.map((i) => i.kind)).toEqual(["homework", "continue", "call"]);
  });

  it("several unread threads are one row to the list, with the total", () => {
    const items = upNext({ ...empty, threads: [thread({ unreadCount: 1 }), thread({ peerId: "t2", unreadCount: 3 }), thread({ peerId: "t3" })] });
    expect(items).toEqual([{ kind: "message", href: "/my/messages", count: 4, teacherName: null }]);
  });

  it("picks the soonest due homework; overdue counts as soonest; none-due last", () => {
    const items = upNext({
      ...empty,
      homework: [hw({ id: "a", dueOn: null }), hw({ id: "b", dueOn: "2026-11-09", lessonSlug: "b" }), hw({ id: "c", dueOn: "2026-10-30", lessonSlug: "c" })],
    });
    expect(items[0].href).toBe("/courses/c1/c");
    expect(upNext({ ...empty, homework: [hw({ id: "a", dueOn: null, lessonSlug: "a" })] })[0].href).toBe("/courses/c1/a");
  });

  it("breaks ties on due date by the oldest assignment, then the id", () => {
    const a = hw({ id: "a", createdAt: "2026-10-21T00:00:00Z" });
    const b = hw({ id: "b", createdAt: "2026-10-20T00:00:00Z" });
    const c = hw({ id: "c", createdAt: "2026-10-20T00:00:00Z" });
    expect([a, c, b].sort(compareHomework).map((h) => h.id)).toEqual(["b", "c", "a"]);
    const nulls = [hw({ id: "y", dueOn: null }), hw({ id: "x", dueOn: null })];
    expect(nulls.sort(compareHomework).map((h) => h.id)).toEqual(["x", "y"]);
  });

  it("skips homework done or not openable yet; a whole-course assignment links to the course", () => {
    const items = upNext({
      ...empty,
      homework: [
        hw({ id: "a", done: true, dueOn: "2026-11-01" }),
        hw({ id: "b", access: "scheduled", dueOn: "2026-11-02" }),
        hw({ id: "c", access: "needs_entitlement", dueOn: "2026-11-02" }),
        hw({ id: "d", lessonSlug: null, lessonTitle: null, access: null, dueOn: "2026-11-03" }),
      ],
    });
    expect(items).toEqual([
      { kind: "homework", href: "/courses/c1", title: "Course one", courseTitle: null, teacherName: "Alina", dueOn: "2026-11-03" },
    ]);
  });

  it("continue skips a finished course and a lesson the homework row already opens", () => {
    const items = upNext({
      ...empty,
      homework: [hw({ courseSlug: "c2", lessonSlug: "l3" })],
      courses: [course({ courseSlug: "done", completed: 3, total: 3 }), course(), course({ courseSlug: "c4", courseTitle: "Course four" })],
    });
    expect(items.map((i) => i.href)).toEqual(["/courses/c2/l3", "/courses/c4/l3"]);
  });

  it("a call counts up to seven days ahead, not after", () => {
    expect(upNext({ ...empty, call: call({ startsAt: "2026-11-09T12:00:00Z" }) })).toHaveLength(1);
    expect(upNext({ ...empty, call: call({ startsAt: "2026-11-09T12:00:01Z" }) })).toHaveLength(0);
  });
});
