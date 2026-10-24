import { describe, expect, it } from "vitest";
import { bytesIn, formatBytes, formatDay, formatMonth, formatUsd } from "./format";

describe("formatUsd", () => {
  it("shows cents, and fractions of a cent rather than $0.00", () => {
    expect(formatUsd(12.5)).toBe("$12.50");
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(0.0035)).toBe("$0.0035");
    expect(formatUsd(1234.567)).toBe("$1,234.57");
  });
});

describe("formatBytes", () => {
  it("uses decimal units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(41_240_000)).toBe("41.2 MB");
    expect(formatBytes(1_050_000_000)).toBe("1.05 GB");
  });

  it("converts a limit to bytes", () => {
    expect(bytesIn("MB", 500)).toBe(500_000_000);
    expect(bytesIn("GB", 1)).toBe(1_000_000_000);
  });
});

describe("formatDay and formatMonth", () => {
  it("reads a UTC day and month, whatever the server's zone", () => {
    expect(formatDay("2026-10-05")).toBe("5 Oct 2026");
    expect(formatDay("not a day")).toBe("not a day");
    expect(formatMonth("2026-10")).toBe("October 2026");
  });
});
