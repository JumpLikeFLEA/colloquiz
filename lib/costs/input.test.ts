import { describe, expect, it } from "vitest";
import { parseExpenseInput, parseLimitInput } from "./input";

const bill = {
  incurredOn: "2026-10-01",
  vendor: "  Vercel  ",
  category: "hosting",
  kind: "bill",
  amountUsd: "20.00",
  reference: "INV-1",
};

describe("parseExpenseInput", () => {
  it("accepts a bill, trims text, reads a numeric string, drops a provider a bill cannot have", () => {
    const r = parseExpenseInput({ ...bill, creditProvider: "anthropic", note: "" });
    expect(r).toEqual({
      ok: true,
      value: {
        id: null,
        incurredOn: "2026-10-01",
        vendor: "Vercel",
        category: "hosting",
        kind: "bill",
        creditProvider: null,
        amountUsd: 20,
        periodStart: null,
        periodEnd: null,
        reference: "INV-1",
        note: null,
      },
    });
  });

  it("a top-up must say whose credit it bought", () => {
    expect(parseExpenseInput({ ...bill, kind: "credit_topup" }).ok).toBe(false);
    expect(parseExpenseInput({ ...bill, kind: "credit_topup", creditProvider: "assemblyai" })).toMatchObject({
      ok: true,
      value: { creditProvider: "assemblyai" },
    });
  });

  it("refuses what the database would refuse, with a message", () => {
    const cases: Record<string, unknown>[] = [
      { ...bill, amountUsd: "0" },
      { ...bill, amountUsd: "-5" },
      { ...bill, amountUsd: "abc" },
      { ...bill, amountUsd: 1.005 },
      { ...bill, vendor: "" },
      { ...bill, vendor: "x".repeat(81) },
      { ...bill, category: "travel" },
      { ...bill, kind: "gift" },
      { ...bill, incurredOn: "2026-13-01" },
      { ...bill, periodStart: "2026-10-10", periodEnd: "2026-10-01" },
      { ...bill, id: "not-a-uuid" },
    ];
    for (const c of cases) {
      const r = parseExpenseInput(c);
      expect(r.ok, JSON.stringify(c)).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(0);
    }
  });

  it("keeps an id for an edit", () => {
    const id = "0b9c5a7e-1d2f-4a3b-8c9d-0e1f2a3b4c5d";
    expect(parseExpenseInput({ ...bill, id })).toMatchObject({ ok: true, value: { id } });
  });
});

const limit = { provider: "Supabase", metric: "Database size", plan: "Free", unit: "MB", limitValue: "500", measured: "db_bytes" };

describe("parseLimitInput", () => {
  it("accepts a measured limit and an empty reading", () => {
    expect(parseLimitInput(limit)).toMatchObject({
      ok: true,
      value: { provider: "Supabase", limitValue: 500, measured: "db_bytes", manualReading: null, readOn: null },
    });
  });

  it("a reading and its date come together", () => {
    expect(parseLimitInput({ ...limit, measured: null, manualReading: "1.2" }).ok).toBe(false);
    expect(parseLimitInput({ ...limit, measured: null, readOn: "2026-10-20" }).ok).toBe(false);
    expect(parseLimitInput({ ...limit, measured: null, manualReading: "1.2", readOn: "2026-10-20" })).toMatchObject({ ok: true });
  });

  it("a measured size is compared in MB or GB only", () => {
    expect(parseLimitInput({ ...limit, unit: "count" }).ok).toBe(false);
    expect(parseLimitInput({ ...limit, unit: "count", measured: null }).ok).toBe(true);
  });

  it("refuses a missing name or unit", () => {
    expect(parseLimitInput({ ...limit, provider: " " }).ok).toBe(false);
    expect(parseLimitInput({ ...limit, metric: "" }).ok).toBe(false);
    expect(parseLimitInput({ ...limit, unit: "TB" }).ok).toBe(false);
  });
});
