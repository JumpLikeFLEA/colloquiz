import { describe, expect, it } from "vitest";
import { INVITE_TOKEN_PATTERN, invitePath, parseInvitePreview, toCourseRunInvite } from "./runInvites";

// The preview JSON as 059's run_invite_preview returned it in this card's
// protocol run (anon, a pending invite).
const PENDING = {
  tier: "basic",
  state: "pending",
  run_title: "A1 in progress",
  course_slug: "proto-cohort-a",
  course_title: "Cohort A",
  run_starts_at: "2026-10-07T16:30:27.430019+00:00",
  already_enrolled: false,
};

describe("parseInvitePreview", () => {
  it("maps a pending invite", () => {
    expect(parseInvitePreview(PENDING)).toEqual({
      state: "pending",
      courseSlug: "proto-cohort-a",
      courseTitle: "Cohort A",
      runTitle: "A1 in progress",
      runStartsAt: "2026-10-07T16:30:27.430019+00:00",
      tier: "basic",
      alreadyEnrolled: false,
    });
  });

  it.each(["claimed_by_you", "used", "expired", "revoked"])("keeps the %s state", (state) => {
    expect(parseInvitePreview({ ...PENDING, state }).state).toBe(state);
  });

  it("reads already_enrolled and the extended tier", () => {
    const p = parseInvitePreview({ ...PENDING, tier: "extended", already_enrolled: true });
    expect(p).toMatchObject({ tier: "extended", alreadyEnrolled: true });
  });

  it("keeps a run with no title as null", () => {
    expect(parseInvitePreview({ ...PENDING, run_title: null })).toMatchObject({ runTitle: null });
  });

  it.each([
    ["the RPC's not_found", { state: "not_found" }],
    ["an unknown state", { ...PENDING, state: "open" }],
    ["a missing course", { ...PENDING, course_slug: undefined }],
    ["null", null],
    ["a string", "pending"],
  ])("reads %s as not_found", (_label, raw) => {
    expect(parseInvitePreview(raw)).toEqual({ state: "not_found" });
  });

  it("never carries a contact label, even if one were sent", () => {
    const p = parseInvitePreview({ ...PENDING, invitee_name: "X", invitee_contact: "x@y.zz" });
    expect(JSON.stringify(p)).not.toContain("x@y.zz");
  });
});

describe("toCourseRunInvite", () => {
  it("renames every field", () => {
    expect(
      toCourseRunInvite({
        invite_id: "i",
        run_id: "r",
        tier: "extended",
        invitee_name: "Tg Person",
        invitee_contact: "@alice_x",
        state: "pending",
        created_at: "c",
        expires_at: "e",
        claimed_at: null,
        revoked_at: null,
      }),
    ).toEqual({
      id: "i",
      runId: "r",
      tier: "extended",
      inviteeName: "Tg Person",
      inviteeContact: "@alice_x",
      state: "pending",
      createdAt: "c",
      expiresAt: "e",
      claimedAt: null,
      revokedAt: null,
    });
  });
});

describe("invite tokens", () => {
  it("accepts the 32-hex shape 059 generates and nothing else", () => {
    expect(INVITE_TOKEN_PATTERN.test("2f3ea82e286ca70dbcb775895b09d9ca")).toBe(true);
    expect(INVITE_TOKEN_PATTERN.test("2F3EA82E286CA70DBCB775895B09D9CA")).toBe(false);
    expect(INVITE_TOKEN_PATTERN.test("2f3ea82e")).toBe(false);
    expect(INVITE_TOKEN_PATTERN.test("../../etc")).toBe(false);
  });

  it("builds the claim path", () => {
    expect(invitePath("2f3ea82e286ca70dbcb775895b09d9ca")).toBe("/invite/2f3ea82e286ca70dbcb775895b09d9ca");
  });
});
