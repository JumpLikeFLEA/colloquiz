import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * ANON-009 (docs/decisions/0081) — /auth/callback records acquisition only
 * for a NEW account (created inside NEW_ACCOUNT_WINDOW_MS, 0069), only when a
 * source arrived, and never changes the redirect. Covers the Settings
 * "link Google" path too: it threads no source, and the account is old.
 */
const exchangeCodeForSession = vi.fn();
const getUser = vi.fn();
const rpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession, getUser }, rpc }),
}));
vi.mock("@/lib/funnelEventServer", () => ({
  recordServerFunnelEvent: vi.fn().mockResolvedValue(undefined),
}));

function acquisitionCalls() {
  return rpc.mock.calls.filter(([name]) => name === "record_signup_acquisition");
}

function userCreatedAgo(ms: number) {
  return { data: { user: { id: "u1", created_at: new Date(Date.now() - ms).toISOString() } } };
}

afterEach(() => {
  exchangeCodeForSession.mockReset();
  getUser.mockReset();
  rpc.mockReset();
});

async function get(url: string) {
  const { GET } = await import("./route");
  return GET(new NextRequest(url));
}

describe("GET /auth/callback — signup acquisition", () => {
  it("a new OAuth account records source + course slug, then redirects to next", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getUser.mockResolvedValue(userCreatedAgo(5_000));
    rpc.mockResolvedValue({ data: { ok: true, recorded: true }, error: null });

    const response = await get(
      "http://localhost:3000/auth/callback?code=xyz&next=%2Fcourses%2Fc%2Fl&source=instagram",
    );

    expect(acquisitionCalls()).toEqual([
      ["record_signup_acquisition", { p_source: "instagram", p_course_slug: "c" }],
    ]);
    expect(response.headers.get("location")).toBe("http://localhost:3000/courses/c/l");
  });

  it("an existing account signing in → no call", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getUser.mockResolvedValue(userCreatedAgo(10 * 24 * 60 * 60 * 1000));
    rpc.mockResolvedValue({ data: null, error: null });

    const response = await get(
      "http://localhost:3000/auth/callback?code=xyz&next=%2Fcourses%2Fc%2Fl&source=instagram",
    );

    expect(acquisitionCalls()).toEqual([]);
    expect(response.headers.get("location")).toBe("http://localhost:3000/courses/c/l");
  });

  it("Settings 'link Google' (no source, old account) → no call", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getUser.mockResolvedValue(userCreatedAgo(30 * 24 * 60 * 60 * 1000));

    await get("http://localhost:3000/auth/callback?code=xyz&next=/app/settings");

    expect(acquisitionCalls()).toEqual([]);
  });

  it("a new account with no source (opt-out, or AuthScreen OAuth) → no call", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getUser.mockResolvedValue(userCreatedAgo(5_000));

    await get("http://localhost:3000/auth/callback?code=xyz&next=%2Fcourses%2Fc%2Fl");

    expect(acquisitionCalls()).toEqual([]);
  });

  it("a failed code exchange → no call, error redirect", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: "bad code" } });

    const response = await get("http://localhost:3000/auth/callback?code=xyz&source=telegram");

    expect(getUser).not.toHaveBeenCalled();
    expect(acquisitionCalls()).toEqual([]);
    expect(response.headers.get("location")).toBe("http://localhost:3000/login?error=oauth");
  });

  it("an RPC error leaves the redirect unchanged", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getUser.mockResolvedValue(userCreatedAgo(5_000));
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });

    const response = await get(
      "http://localhost:3000/auth/callback?code=xyz&next=%2Fcourses%2Fc%2Fl&source=telegram",
    );

    expect(response.headers.get("location")).toBe("http://localhost:3000/courses/c/l");
  });
});
