import { describe, expect, it } from "vitest";
import { daysIn, monthOf, monthPeriod, monthsIn, monthsPeriod, shiftMonth } from "./period";

describe("monthPeriod", () => {
  it("is a half-open range of UTC days", () => {
    expect(monthPeriod("2026-10")).toEqual({ from: "2026-10-01", to: "2026-11-01" });
    expect(monthPeriod("2026-12")).toEqual({ from: "2026-12-01", to: "2027-01-01" });
  });

  it("rejects anything that is not a month", () => {
    for (const bad of ["2026-13", "2026-1", "26-10", "", "2026-10-01", "1999-01", "abcd-ef"]) expect(monthPeriod(bad)).toBeNull();
  });
});

describe("monthsPeriod", () => {
  it("spans both months, inclusive", () => {
    expect(monthsPeriod("2026-09", "2026-11")).toEqual({ from: "2026-09-01", to: "2026-12-01" });
    expect(monthsPeriod("2026-10", "2026-10")).toEqual({ from: "2026-10-01", to: "2026-11-01" });
  });

  it("refuses a reversed or unreadable range", () => {
    expect(monthsPeriod("2026-11", "2026-09")).toBeNull();
    expect(monthsPeriod("2026-11", "x")).toBeNull();
  });
});

describe("months and days", () => {
  it("shifts across a year", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });

  it("lists the months and days of a period", () => {
    expect(monthsIn({ from: "2026-11-01", to: "2027-02-01" })).toEqual(["2026-11", "2026-12", "2027-01"]);
    const feb = daysIn({ from: "2028-02-01", to: "2028-03-01" });
    expect(feb.length).toBe(29);
    expect(feb[28]).toBe("2028-02-29");
  });

  it("reads a month in UTC", () => {
    expect(monthOf(new Date("2026-10-31T23:30:00Z"))).toBe("2026-10");
  });
});
