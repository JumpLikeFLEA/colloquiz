import { describe, expect, it, vi } from "vitest";
import { feedbackItems, listedCourses, nextCall, type FeedbackRow, type HomeCall, type HomeCourse, type HomeEnrolment } from "./learnerHome";

const course = (id: string, format: HomeCourse["format"] = "self_paced"): HomeCourse => ({
  id,
  slug: `slug-${id}`,
  title: `Course ${id}`,
  level: "B1",
  coverImageUrl: null,
  format,
});

const enrolment = (courseId: string, runId: string, tier: HomeEnrolment["tier"], runStartsAt = "2026-11-02T09:00:00Z"): HomeEnrolment => ({
  courseId,
  runId,
  runTitle: null,
  runStartsAt,
  tier,
});

describe("listedCourses", () => {
  const published = [course("a"), course("b"), course("c", "cohort"), course("d")];

  it("lists attempted, enrolled and granted courses and nothing else", () => {
    const listed = listedCourses(published, new Set(["a"]), [enrolment("c", "r1", "basic")], new Set(["d"]));
    expect(listed.map((l) => l.course.id).sort()).toEqual(["a", "c", "d"]);
    const byId = new Map(listed.map((l) => [l.course.id, l]));
    expect(byId.get("a")).toMatchObject({ attempted: true, granted: false, enrolments: [] });
    expect(byId.get("c")).toMatchObject({ attempted: false, granted: false });
    expect(byId.get("c")!.enrolments).toHaveLength(1);
    expect(byId.get("d")).toMatchObject({ attempted: false, granted: true, enrolments: [] });
  });

  it("lists nothing for a learner with no activity", () => {
    expect(listedCourses(published, new Set(), [], new Set())).toEqual([]);
  });

  it("drops an enrolment, grant or attempt on a course that isn't published", () => {
    const listed = listedCourses(published, new Set(["x"]), [enrolment("y", "r1", "extended")], new Set(["z"]));
    expect(listed).toEqual([]);
  });

  it("puts enrolled courses first and keeps catalogue order inside each group", () => {
    const listed = listedCourses(
      published,
      new Set(["a", "b", "d"]),
      [enrolment("d", "r1", "basic"), enrolment("b", "r2", "basic")],
      new Set(),
    );
    expect(listed.map((l) => l.course.id)).toEqual(["b", "d", "a"]);
  });

  it("orders a course's enrolments latest run first", () => {
    const listed = listedCourses(
      published,
      new Set(),
      [enrolment("c", "old", "basic", "2026-01-05T09:00:00Z"), enrolment("c", "new", "extended", "2026-11-02T09:00:00Z")],
      new Set(),
    );
    expect(listed[0].enrolments.map((e) => e.runId)).toEqual(["new", "old"]);
  });
});

describe("nextCall", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  const call = (id: string, runId: string, startsAt: string): HomeCall => ({
    id,
    runId,
    courseId: "c",
    startsAt,
    meetUrl: `https://meet.example/${id}`,
    title: null,
  });

  it("is the soonest upcoming call of an extended run", () => {
    const calls = [
      call("later", "r1", "2026-11-20T18:00:00Z"),
      call("sooner", "r1", "2026-11-12T18:00:00Z"),
      call("past", "r1", "2026-11-03T18:00:00Z"),
    ];
    expect(nextCall(calls, [enrolment("c", "r1", "extended")], now)?.id).toBe("sooner");
  });

  it("keeps a call that started under two hours ago (still joinable)", () => {
    const calls = [call("live", "r1", "2026-11-10T11:00:00Z"), call("next", "r1", "2026-11-12T18:00:00Z")];
    expect(nextCall(calls, [enrolment("c", "r1", "extended")], now)?.id).toBe("live");
  });

  it("drops calls of runs the learner isn't extended in (an editor gets every run's calls)", () => {
    const calls = [call("other", "r2", "2026-11-11T18:00:00Z"), call("basicRun", "r3", "2026-11-11T18:00:00Z")];
    expect(nextCall(calls, [enrolment("c", "r1", "extended"), enrolment("c", "r3", "basic")], now)).toBeNull();
  });

  it("is null with no upcoming call", () => {
    expect(nextCall([call("past", "r1", "2026-11-01T18:00:00Z")], [enrolment("c", "r1", "extended")], now)).toBeNull();
    expect(nextCall([], [enrolment("c", "r1", "extended")], now)).toBeNull();
  });
});

describe("feedbackItems", () => {
  const body = (text: string) => ({ paragraphs: [{ runs: [{ text }] }] });
  const voice = (submissionId: string, publishedAt: string, b: unknown = body("ok")): FeedbackRow => ({
    kind: "voice",
    submissionId,
    courseSlug: "s",
    courseTitle: "S",
    lessonSlug: "l",
    lessonTitle: "L",
    publishedAt,
    body: b,
  });

  it("sorts newest first across voice feedback and final comments", () => {
    const rows: FeedbackRow[] = [
      voice("v1", "2026-11-05T10:00:00Z"),
      { kind: "final", runId: "r1", courseSlug: "s", courseTitle: "S", publishedAt: "2026-11-30T10:00:00Z", body: body("final") },
      voice("v2", "2026-11-12T10:00:00Z"),
    ];
    const items = feedbackItems(rows, () => {});
    expect(items.map((i) => (i.kind === "voice" ? i.submissionId : i.runId))).toEqual(["r1", "v2", "v1"]);
    expect(items[0].body).toEqual(body("final"));
  });

  it("drops and reports a body that doesn't parse, never renders it raw", () => {
    const onInvalid = vi.fn();
    const items = feedbackItems([voice("bad", "2026-11-05T10:00:00Z", "<b>html</b>"), voice("good", "2026-11-04T10:00:00Z")], onInvalid);
    expect(items.map((i) => (i.kind === "voice" ? i.submissionId : null))).toEqual(["good"]);
    expect(onInvalid).toHaveBeenCalledWith("voice:bad");
  });
});
