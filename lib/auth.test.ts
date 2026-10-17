import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authUserFrom, usernameFromClaims } from "./auth";

function clientWithClaims(claims: Record<string, unknown> | null, error: unknown = null): SupabaseClient {
  return {
    auth: { getClaims: async () => ({ data: claims ? { claims } : null, error }) },
  } as unknown as SupabaseClient;
}

describe("authUserFrom", () => {
  it("returns the id and email from the claims", async () => {
    await expect(authUserFrom(clientWithClaims({ sub: "u1", email: "a@example.com" }))).resolves.toEqual({
      id: "u1",
      email: "a@example.com",
      username: null,
    });
  });

  it("reads an empty email (a Telegram account's JWT, docs/decisions/0098) as null", async () => {
    await expect(authUserFrom(clientWithClaims({ sub: "u1", email: "" }))).resolves.toEqual({ id: "u1", email: null, username: null });
  });

  it("reads a missing email as null", async () => {
    await expect(authUserFrom(clientWithClaims({ sub: "u1" }))).resolves.toEqual({ id: "u1", email: null, username: null });
  });

  it("returns null with no session or on an error", async () => {
    await expect(authUserFrom(clientWithClaims(null))).resolves.toBeNull();
    await expect(authUserFrom(clientWithClaims({ sub: "u1" }, new Error("bad jwt")))).resolves.toBeNull();
  });

  it("reads the Telegram username from user_metadata when the email is empty", async () => {
    await expect(
      authUserFrom(clientWithClaims({ sub: "u1", email: "", user_metadata: { preferred_username: "probe_user" } })),
    ).resolves.toEqual({ id: "u1", email: null, username: "probe_user" });
  });

  it("ignores a username on an account that has an email", async () => {
    await expect(
      authUserFrom(clientWithClaims({ sub: "u1", email: "a@example.com", user_metadata: { preferred_username: "x" } })),
    ).resolves.toEqual({ id: "u1", email: "a@example.com", username: null });
  });
});

describe("usernameFromClaims", () => {
  it("strips a leading @ and surrounding whitespace", () => {
    expect(usernameFromClaims({ user_metadata: { preferred_username: " @probe_user " } })).toBe("probe_user");
  });

  it("caps the length", () => {
    expect(usernameFromClaims({ user_metadata: { preferred_username: "a".repeat(100) } })).toHaveLength(64);
  });

  it("is null for a missing, empty, non-string or all-@ value", () => {
    expect(usernameFromClaims({})).toBeNull();
    expect(usernameFromClaims({ user_metadata: null })).toBeNull();
    expect(usernameFromClaims({ user_metadata: {} })).toBeNull();
    expect(usernameFromClaims({ user_metadata: { preferred_username: "" } })).toBeNull();
    expect(usernameFromClaims({ user_metadata: { preferred_username: 42 } })).toBeNull();
    expect(usernameFromClaims({ user_metadata: { preferred_username: "@@" } })).toBeNull();
  });
});
