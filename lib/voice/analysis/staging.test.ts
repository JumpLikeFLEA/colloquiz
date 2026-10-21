import { describe, expect, it } from "vitest";
import { isLoopbackUrl, namesNoUser, shouldReclaim, stagedObjectName, RECLAIM_AFTER_MS } from "./staging";

const COURSE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TAKE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const R1 = "11111111-1111-4111-8111-111111111111";
const R2 = "22222222-2222-4222-8222-222222222222";

describe("stagedObjectName", () => {
  it("keeps the take's extension and names neither the user, the course nor the take", () => {
    for (const ext of ["webm", "ogg", "m4a"]) {
      const take = `${COURSE}/${USER}/${TAKE}.${ext}`;
      const staged = stagedObjectName(take, R1, R2);
      expect(staged).toBe(`${R1}/${R2}.${ext}`);
      expect(staged).not.toContain(USER);
      expect(staged).not.toContain(COURSE);
      expect(staged).not.toContain(TAKE);
      expect(namesNoUser(staged, USER, COURSE)).toBe(true);
    }
  });

  it("the check is not vacuous: the take's own name fails it", () => {
    expect(namesNoUser(`${COURSE}/${USER}/${TAKE}.webm`, USER, COURSE)).toBe(false);
  });

  it("falls back to .webm for a name with no known extension", () => {
    expect(stagedObjectName("whatever", R1, R2)).toBe(`${R1}/${R2}.webm`);
  });
});

describe("isLoopbackUrl", () => {
  it("is true for the local stack and false for a hosted project", () => {
    expect(isLoopbackUrl("http://127.0.0.1:54321/storage/v1/object/sign/x?token=1")).toBe(true);
    expect(isLoopbackUrl("http://localhost:54321/a")).toBe(true);
    expect(isLoopbackUrl("https://kumrlovftctxcbbbmnfy.supabase.co/storage/v1/object/sign/x")).toBe(false);
    expect(isLoopbackUrl("https://localhost.evil.example/a")).toBe(false);
    expect(isLoopbackUrl("not a url")).toBe(false);
  });
});

describe("shouldReclaim", () => {
  const now = Date.parse("2026-10-21T12:00:00Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it("offers a stale row that is not finished", () => {
    for (const status of ["pending", "transcribing", "analysing"]) {
      expect(shouldReclaim(status, ago(RECLAIM_AFTER_MS + 1), now)).toBe(true);
    }
  });
  it("leaves a fresh row to the run that is working on it", () => {
    expect(shouldReclaim("transcribing", ago(RECLAIM_AFTER_MS - 1000), now)).toBe(false);
  });
  it("never offers a finished row, however old", () => {
    expect(shouldReclaim("done", ago(10 * RECLAIM_AFTER_MS), now)).toBe(false);
    expect(shouldReclaim("failed", ago(10 * RECLAIM_AFTER_MS), now)).toBe(false);
  });
  it("offers a row whose time is unreadable rather than stranding it", () => {
    expect(shouldReclaim("pending", "garbage", now)).toBe(true);
  });
});
