import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authUserFrom } from "./auth";

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
    });
  });

  it("reads an empty email (a Telegram account's JWT, docs/decisions/0098) as null", async () => {
    await expect(authUserFrom(clientWithClaims({ sub: "u1", email: "" }))).resolves.toEqual({ id: "u1", email: null });
  });

  it("reads a missing email as null", async () => {
    await expect(authUserFrom(clientWithClaims({ sub: "u1" }))).resolves.toEqual({ id: "u1", email: null });
  });

  it("returns null with no session or on an error", async () => {
    await expect(authUserFrom(clientWithClaims(null))).resolves.toBeNull();
    await expect(authUserFrom(clientWithClaims({ sub: "u1" }, new Error("bad jwt")))).resolves.toBeNull();
  });
});
