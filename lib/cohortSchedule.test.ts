// The wall-clock helpers read the runtime's zone. Pin one with a
// daylight-saving change (the partner's, Serbia: CET/CEST) so the DST cases
// below mean something; vitest runs each test file in its own worker.
process.env.TZ = "Europe/Belgrade";

import { describe, expect, it } from "vitest";
import {
  fromLocalDateTime,
  isLocalDateTime,
  runPhase,
  toLocalDateTime,
  weeklyRepeats,
} from "./cohortSchedule";

describe("runPhase", () => {
  const run = { startsAt: "2026-11-02T18:00:00.000Z", endsAt: "2026-11-30T18:00:00.000Z" };

  it("is upcoming before the start", () => {
    expect(runPhase(run, new Date("2026-11-02T17:59:59.999Z"))).toBe("upcoming");
  });

  it("is in progress from the start (inclusive) to the end (exclusive)", () => {
    expect(runPhase(run, new Date("2026-11-02T18:00:00.000Z"))).toBe("in_progress");
    expect(runPhase(run, new Date("2026-11-30T17:59:59.999Z"))).toBe("in_progress");
  });

  it("is ended at the end", () => {
    expect(runPhase(run, new Date("2026-11-30T18:00:00.000Z"))).toBe("ended");
  });
});

describe("weeklyRepeats", () => {
  it("returns count wall-clock times one calendar week apart", () => {
    expect(weeklyRepeats("2026-11-03T19:00", 4)).toEqual([
      "2026-11-03T19:00",
      "2026-11-10T19:00",
      "2026-11-17T19:00",
      "2026-11-24T19:00",
    ]);
  });

  it("rolls over months and years", () => {
    expect(weeklyRepeats("2026-12-29T08:30", 2)).toEqual(["2026-12-29T08:30", "2027-01-05T08:30"]);
  });

  it("keeps the wall-clock time across a daylight-saving change", () => {
    // CEST ends on 2026-10-25 in Europe/Belgrade.
    const times = weeklyRepeats("2026-10-20T19:00", 2);
    expect(times).toEqual(["2026-10-20T19:00", "2026-10-27T19:00"]);
    const [a, b] = times.map((t) => fromLocalDateTime(t)!);
    expect(a).toBe("2026-10-20T17:00:00.000Z"); // CEST, UTC+2
    expect(b).toBe("2026-10-27T18:00:00.000Z"); // CET, UTC+1
  });

  it("returns nothing for a bad start or count", () => {
    expect(weeklyRepeats("2026-11-03", 3)).toEqual([]);
    expect(weeklyRepeats("2026-11-03T19:00", 0)).toEqual([]);
    expect(weeklyRepeats("2026-11-03T19:00", 1.5)).toEqual([]);
  });
});

describe("local date-time conversion", () => {
  it("round-trips an instant through the editor's wall clock", () => {
    const iso = "2026-11-02T18:00:00.000Z";
    expect(toLocalDateTime(iso)).toBe("2026-11-02T19:00");
    expect(fromLocalDateTime(toLocalDateTime(iso))).toBe(iso);
  });

  it("rejects anything that isn't a datetime-local value", () => {
    expect(isLocalDateTime("2026-11-02T19:00")).toBe(true);
    expect(isLocalDateTime("2026-11-02 19:00")).toBe(false);
    expect(fromLocalDateTime("")).toBeNull();
    expect(fromLocalDateTime("tomorrow")).toBeNull();
  });
});
