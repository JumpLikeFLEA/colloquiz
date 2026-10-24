import { describe, expect, it } from "vitest";
import { resourceRows } from "./resources";
import type { ResourceLimit, ResourceUsage } from "./types";

const limit = (over: Partial<ResourceLimit>): ResourceLimit => ({
  id: "l",
  provider: "Supabase",
  metric: "Database size",
  plan: "Free",
  limitValue: 500,
  unit: "MB",
  measured: null,
  manualReading: null,
  readOn: null,
  note: null,
  ...over,
});

const usage: ResourceUsage = {
  measuredAt: "2026-10-24T10:00:00Z",
  dbBytes: 41_000_000,
  buckets: [
    { bucket: "avatars", objects: 3, bytes: 200_000_000 },
    { bucket: "voice-recordings", objects: 10, bytes: 300_000_000 },
  ],
};

describe("resourceRows", () => {
  it("compares a measured database size with its limit, in the limit's unit", () => {
    const [r] = resourceRows([limit({ measured: "db_bytes" })], usage);
    expect(r).toMatchObject({ used: 41, source: "measured", over: false });
    expect(r.fraction).toBeCloseTo(41 / 500, 10);
  });

  it("adds every bucket for Storage, and converts to GB", () => {
    const [r] = resourceRows([limit({ metric: "Storage", measured: "storage_bytes", unit: "GB", limitValue: 1 })], usage);
    expect(r.used).toBeCloseTo(0.5, 10);
    expect(r.fraction).toBeCloseTo(0.5, 10);
  });

  it("uses a manual reading when nothing measures it", () => {
    const [r] = resourceRows([limit({ metric: "Egress", unit: "GB", limitValue: 5, manualReading: 6, readOn: "2026-10-20" })], usage);
    expect(r).toMatchObject({ used: 6, source: "manual", fraction: 1, over: true });
  });

  it("says nothing was read rather than showing zero", () => {
    const [r] = resourceRows([limit({ metric: "Egress", unit: "GB" })], usage);
    expect(r).toMatchObject({ used: null, source: "none", fraction: null, over: false });
  });

  it("a measured limit without a measurement falls back to its reading, then to nothing", () => {
    expect(resourceRows([limit({ measured: "db_bytes" })], null)[0]).toMatchObject({ source: "none", used: null });
  });

  it("a limit with no value or a zero value has no bar", () => {
    expect(resourceRows([limit({ measured: "db_bytes", limitValue: null })], usage)[0].fraction).toBeNull();
    expect(resourceRows([limit({ measured: "db_bytes", limitValue: 0 })], usage)[0].fraction).toBeNull();
  });
});
