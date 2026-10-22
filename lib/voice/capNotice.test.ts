import { describe, expect, it } from "vitest";
import { capNoticeText } from "./capNotice";

const fmt = (iso: string) => `T(${iso})`;

describe("capNoticeText", () => {
  it("names the per-task limit and says nothing was sent", () => {
    const t = capNoticeText({ kind: "task_cap", retryAt: null }, fmt);
    expect(t).toContain("was not sent");
    expect(t).toContain("3 recordings");
  });

  it("gives the time the daily limit frees a place", () => {
    const t = capNoticeText({ kind: "daily_cap", retryAt: "2026-10-22T18:07:26.342Z" }, fmt);
    expect(t).toContain("today's limit");
    expect(t).toContain("T(2026-10-22T18:07:26.342Z)");
  });

  it("falls back to 'later' when the time is unknown (control: the same cap with a time does not)", () => {
    const t = capNoticeText({ kind: "daily_cap", retryAt: null }, fmt);
    expect(t).toContain("Try again later.");
    expect(t).not.toContain("T(");
  });
});
