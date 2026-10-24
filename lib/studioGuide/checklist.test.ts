import { describe, expect, it } from "vitest";
import { buildChecklist, focusCourse, type ChecklistFacts } from "./checklist";

type C = ChecklistFacts["courses"][number];
const course = (o: Partial<C> = {}): C => ({
  id: "c1",
  title: "Course",
  status: "draft",
  lessonCount: 0,
  subtitle: null,
  coverImageUrl: null,
  createdAt: "2026-01-01T00:00:00Z",
  ...o,
});
const base: ChecklistFacts = {
  courses: [],
  hasStudentLink: false,
  linkedStudentCount: 0,
  hasClaimedInvite: false,
  hasHomework: false,
  canImport: false,
  inboxHasItems: false,
};
const ticks = (f: ChecklistFacts) => {
  const c = buildChecklist(f);
  if (c.phase === "hidden") return null;
  return { phase: c.phase, core: c.core.map((s) => s.done), extras: c.extras.map((s) => `${s.id}:${s.done}`) };
};

describe("focusCourse (0206 Decision 4)", () => {
  it("is null with no course", () => expect(focusCourse([])).toBeNull());
  it("prefers the oldest published course", () => {
    const f = focusCourse([
      course({ id: "d", createdAt: "2026-03-01" }),
      course({ id: "p2", status: "published", createdAt: "2026-02-01" }),
      course({ id: "p1", status: "published", createdAt: "2026-01-05" }),
    ]);
    expect(f?.id).toBe("p1");
  });
  it("else the newest draft", () => {
    const f = focusCourse([course({ id: "a", createdAt: "2026-01-01" }), course({ id: "b", createdAt: "2026-02-01" })]);
    expect(f?.id).toBe("b");
  });
});

describe("buildChecklist", () => {
  it("fresh: nothing ticked", () => {
    expect(ticks(base)).toMatchObject({ phase: "full", core: [false, false, false, false] });
  });

  it("part-way: a course with a lesson, not published", () => {
    expect(ticks({ ...base, courses: [course({ lessonCount: 2 })] })).toMatchObject({
      phase: "full",
      core: [true, true, false, false],
    });
  });

  it("the course steps follow one course: a cover on another course does not tick this one", () => {
    const c = buildChecklist({
      ...base,
      courses: [
        course({ id: "pub", status: "published", createdAt: "2026-01-01", lessonCount: 1 }),
        course({ id: "other", createdAt: "2026-02-01", coverImageUrl: "x", subtitle: "y" }),
      ],
    });
    if (c.phase === "hidden") throw new Error("hidden");
    expect(c.focus?.id).toBe("pub");
    expect(c.extras.find((s) => s.id === "cover")?.done).toBe(false);
  });

  it("each way of sharing ticks invite, and without one the core is not done", () => {
    const pub = [course({ status: "published", lessonCount: 1 })];
    for (const share of [{ hasStudentLink: true }, { linkedStudentCount: 1 }, { hasClaimedInvite: true }]) {
      expect(ticks({ ...base, courses: pub, ...share })?.phase).toBe("setup");
    }
    expect(ticks({ ...base, courses: pub })?.phase).toBe("full");
  });

  it("core done: collapses to setup with only the extras left; link-only extras never tick", () => {
    const r = ticks({
      ...base,
      courses: [course({ status: "published", lessonCount: 1, coverImageUrl: "x", subtitle: "y" })],
      hasStudentLink: true,
    });
    expect(r?.phase).toBe("setup");
    expect(r?.extras).toEqual(["preview:null", "access:null", "homework:false"]);
  });

  it("gone once the tickable extras are done, link-only ones notwithstanding", () => {
    expect(
      ticks({
        ...base,
        courses: [course({ status: "published", lessonCount: 1, coverImageUrl: "x", subtitle: "y" })],
        hasStudentLink: true,
        hasHomework: true,
      }),
    ).toBeNull();
  });

  it("the collapsed card is gone when the inbox has items; the full one is not", () => {
    const done = { courses: [course({ status: "published", lessonCount: 1 })], hasStudentLink: true };
    expect(ticks({ ...base, ...done, inboxHasItems: true })).toBeNull();
    expect(ticks({ ...base, inboxHasItems: true })?.phase).toBe("full");
  });

  it("a cover without a summary does not tick the cover step", () => {
    const c = buildChecklist({ ...base, courses: [course({ coverImageUrl: "x" })] });
    if (c.phase === "hidden") throw new Error("hidden");
    expect(c.extras.find((s) => s.id === "cover")?.done).toBe(false);
  });
});
