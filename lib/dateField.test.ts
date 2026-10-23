// A zone with a daylight-saving change, so a UTC-midnight parse would show
// up as the previous day.
process.env.TZ = "America/New_York";

import { describe, expect, it } from "vitest";
import {
  displayDate,
  formatDateValue,
  joinDateTime,
  parseDateValue,
  parseTimeText,
  splitDateTime,
} from "./dateField";

describe("parseDateValue", () => {
  it("reads the local calendar day, not UTC midnight", () => {
    const d = parseDateValue("2026-11-01")!;
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 10, 1, 0]);
  });

  it("refuses an impossible day and other shapes", () => {
    expect(parseDateValue("2026-02-30")).toBeNull();
    expect(parseDateValue("2026-13-01")).toBeNull();
    expect(parseDateValue("2026-1-01")).toBeNull();
    expect(parseDateValue("")).toBeNull();
    expect(parseDateValue("2026-11-01T10:00")).toBeNull();
  });

  it("round-trips through formatDateValue", () => {
    for (const v of ["2026-01-01", "2026-03-08", "2026-11-01", "2028-02-29"]) {
      expect(formatDateValue(parseDateValue(v)!)).toBe(v);
    }
  });
});

describe("parseTimeText", () => {
  it("accepts one- or two-digit hours and pads them", () => {
    expect(parseTimeText("9:05")).toBe("09:05");
    expect(parseTimeText("19:00")).toBe("19:00");
    expect(parseTimeText(" 00:00 ")).toBe("00:00");
    expect(parseTimeText("23:59")).toBe("23:59");
  });

  it("refuses out-of-range and partial times", () => {
    expect(parseTimeText("24:00")).toBeNull();
    expect(parseTimeText("12:60")).toBeNull();
    expect(parseTimeText("12:5")).toBeNull();
    expect(parseTimeText("12")).toBeNull();
    expect(parseTimeText("")).toBeNull();
    expect(parseTimeText("7pm")).toBeNull();
  });
});

describe("splitDateTime / joinDateTime", () => {
  it("splits a datetime-local value and joins it back", () => {
    expect(splitDateTime("2026-10-20T14:41")).toEqual({ date: "2026-10-20", time: "14:41" });
    expect(joinDateTime("2026-10-20", "14:41")).toBe("2026-10-20T14:41");
  });

  it("splits anything else into empty halves", () => {
    expect(splitDateTime("")).toEqual({ date: "", time: "" });
    expect(splitDateTime("2026-10-20")).toEqual({ date: "", time: "" });
  });

  it("joins to empty unless both halves are valid", () => {
    expect(joinDateTime("2026-10-20", "9:5")).toBe("");
    expect(joinDateTime("", "09:00")).toBe("");
    expect(joinDateTime("2026-02-30", "09:00")).toBe("");
    expect(joinDateTime("2026-10-20", "9:05")).toBe("2026-10-20T09:05");
  });
});

describe("displayDate", () => {
  it("reads as day, short month, year", () => {
    expect(displayDate(parseDateValue("2026-10-20")!)).toBe("20 Oct 2026");
  });
});
