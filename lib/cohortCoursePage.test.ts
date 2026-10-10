import { describe, expect, it } from "vitest";
import {
  CALL_JOINABLE_MINUTES,
  callsForAudience,
  cohortAudience,
  groupLessonsByWeek,
  nextUpcomingRun,
  splitCalls,
  type RunCall,
} from "./cohortCoursePage";

const D1 = "2026-11-02T17:00:00.000Z";
const D2 = "2026-11-09T17:00:00.000Z";

function l(slug: string, week: number | null, state = "open", opensAt: string | null = null) {
  return { slug, week, state, opensAt };
}

describe("groupLessonsByWeek", () => {
  it("puts weekless lessons first, then weeks ascending, numbering by input position", () => {
    const groups = groupLessonsByWeek([l("a", 2), l("b", null), l("c", 1), l("d", 2)]);
    expect(groups.map((g) => [g.week, g.lessons.map((x) => `${x.slug}${x.position}`)])).toEqual([
      [null, ["b2"]],
      [1, ["c3"]],
      [2, ["a1", "d4"]],
    ]);
  });

  it("lifts a shared opensAt to the group when every lesson is scheduled for that moment", () => {
    const [g] = groupLessonsByWeek([l("a", 2, "scheduled", D1), l("b", 2, "scheduled", D1)]);
    expect(g.opensAt).toBe(D1);
  });

  it("leaves opensAt on the rows when the group is mixed", () => {
    const mixedTimes = groupLessonsByWeek([l("a", 2, "scheduled", D1), l("b", 2, "scheduled", D2)]);
    const mixedStates = groupLessonsByWeek([l("a", 2, "scheduled", D1), l("b", 2, "open")]);
    const notScheduled = groupLessonsByWeek([l("a", 1, "needs_entitlement")]);
    expect([mixedTimes[0].opensAt, mixedStates[0].opensAt, notScheduled[0].opensAt]).toEqual([null, null, null]);
  });

  it("returns nothing for no lessons", () => {
    expect(groupLessonsByWeek([])).toEqual([]);
  });
});

function call(id: string, startsAt: string, runId = "r1"): RunCall {
  return { id, runId, startsAt, meetUrl: `https://meet.google.com/${id}`, title: null };
}

describe("splitCalls", () => {
  const now = new Date("2026-11-05T12:00:00.000Z");

  it("lists upcoming soonest first, then past most recent first", () => {
    const { upcoming, past } = splitCalls(
      [
        call("p-old", "2026-10-20T17:00:00.000Z"),
        call("u-late", "2026-11-20T17:00:00.000Z"),
        call("p-new", "2026-11-01T17:00:00.000Z"),
        call("u-soon", "2026-11-06T17:00:00.000Z"),
      ],
      now,
    );
    expect(upcoming.map((c) => c.id)).toEqual(["u-soon", "u-late"]);
    expect(past.map((c) => c.id)).toEqual(["p-new", "p-old"]);
  });

  it("keeps a call joinable for the window after its start, and not a minute past it", () => {
    const inside = new Date(now.getTime() - (CALL_JOINABLE_MINUTES - 1) * 60_000).toISOString();
    const edge = new Date(now.getTime() - CALL_JOINABLE_MINUTES * 60_000).toISOString();
    const { upcoming, past } = splitCalls([call("inside", inside), call("edge", edge)], now);
    expect(upcoming.map((c) => c.id)).toEqual(["inside"]);
    expect(past.map((c) => c.id)).toEqual(["edge"]);
  });
});

describe("nextUpcomingRun", () => {
  const now = new Date("2026-11-05T12:00:00.000Z");
  it("picks the earliest run that has not started", () => {
    const runs = [
      { id: "started", title: null, startsAt: "2026-11-01T00:00:00.000Z" },
      { id: "later", title: null, startsAt: "2026-12-07T00:00:00.000Z" },
      { id: "next", title: null, startsAt: "2026-11-30T00:00:00.000Z" },
    ];
    expect(nextUpcomingRun(runs, now)?.id).toBe("next");
  });
  it("is null when every run has started", () => {
    expect(nextUpcomingRun([{ id: "a", title: null, startsAt: "2026-11-01T00:00:00.000Z" }], now)).toBeNull();
  });
});

describe("cohortAudience", () => {
  const locked = [{ state: "needs_entitlement" }];
  const open = [{ state: "open" }];

  it("extended wins over basic and carries only the extended runs", () => {
    const a = cohortAudience(
      [
        { runId: "r1", tier: "basic" },
        { runId: "r2", tier: "extended" },
      ],
      locked,
    );
    expect(a.kind).toBe("extended");
    expect(a.kind === "extended" && [...a.callRunIds]).toEqual(["r2"]);
  });

  it("basic-only is basic", () => {
    expect(cohortAudience([{ runId: "r1", tier: "basic" }], locked).kind).toBe("basic");
  });

  it("not enrolled with something locked is a visitor; with nothing locked, none", () => {
    expect(cohortAudience([], locked).kind).toBe("visitor");
    expect(cohortAudience([], open).kind).toBe("none");
  });
});

describe("callsForAudience", () => {
  const calls = [call("a", D1, "r1"), call("b", D2, "r2")];

  it("an extended learner gets their run's calls only", () => {
    const a = cohortAudience([{ runId: "r1", tier: "extended" }], []);
    expect(callsForAudience(calls, a).map((c) => c.id)).toEqual(["a"]);
  });

  it("basic, visitor and none get no calls even if rows were passed", () => {
    for (const a of [cohortAudience([{ runId: "r1", tier: "basic" }], []), cohortAudience([], [{ state: "needs_entitlement" }]), cohortAudience([], [])]) {
      expect(callsForAudience(calls, a)).toEqual([]);
    }
  });
});
