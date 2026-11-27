import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { invitePath } from "@/lib/runInvites";
import { joinPath } from "@/lib/teacherLinks";

/**
 * SHELL-040 (docs/decisions/0252): the join and invite pages' "Not you? Sign
 * out" posts here with `next` = that page, and safeNext must keep it, so the
 * learner lands back on the same link signed out. The Supabase client is
 * mocked; signOut is counted so a redirect without a sign-out can't pass.
 */
const signOut = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { signOut } }) }));

const TOKEN = "a".repeat(32);

async function post(next: string | null) {
  const { POST } = await import("./route");
  const body = new FormData();
  if (next !== null) body.set("next", next);
  return POST(new NextRequest("http://localhost:3000/auth/sign-out", { method: "POST", body }));
}

describe("POST /auth/sign-out", () => {
  it.each([
    ["join", joinPath(TOKEN)],
    ["invite", invitePath(TOKEN)],
  ])("returns to the %s page it came from, 303", async (_name, path) => {
    expect(path).toContain(TOKEN);
    signOut.mockClear();
    const response = await post(path);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`http://localhost:3000${path}`);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("refuses a cross-origin next and goes to / (positive control for safeNext)", async () => {
    const response = await post("https://evil.example/join/x");
    expect(response.headers.get("location")).toBe("http://localhost:3000/");
  });

  it("goes to / with no next", async () => {
    const response = await post(null);
    expect(response.headers.get("location")).toBe("http://localhost:3000/");
  });
});
