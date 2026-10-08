import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * ANON-016 — the three failure redirects (failed `code` exchange, expired
 * `token_hash`, no params) keep `next`, passed through `safeNext`, so
 * /login can send a successful sign-in back to the lesson.
 */
const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: new Error("pkce") });
const verifyOtp = vi.fn().mockResolvedValue({ error: new Error("expired") });

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession, verifyOtp }, rpc: vi.fn() }),
}));

afterEach(() => {
  exchangeCodeForSession.mockClear();
  verifyOtp.mockClear();
});

async function get(query: string): Promise<string> {
  const { GET } = await import("./route");
  const response = await GET(new NextRequest(`http://localhost:3000/auth/confirm?${query}`));
  return response.headers.get("location")!;
}

const LESSON = "%2Fcourses%2Fc%2Fl";

describe("GET /auth/confirm — failure redirects carry next", () => {
  it("failed code exchange -> notice=confirmed_sign_in with next", async () => {
    expect(await get(`code=abc&next=${LESSON}`)).toBe(
      "http://localhost:3000/login?notice=confirmed_sign_in&next=%2Fcourses%2Fc%2Fl",
    );
  });

  it("expired token_hash (signup) -> error=confirm_expired with next", async () => {
    expect(await get(`token_hash=abc&type=email&next=${LESSON}`)).toBe(
      "http://localhost:3000/login?error=confirm_expired&next=%2Fcourses%2Fc%2Fl",
    );
  });

  it("expired token_hash wrapped in a full confirm URL still yields the inner next", async () => {
    const wrapped = encodeURIComponent("http://localhost:3000/auth/confirm?next=%2Fcourses%2Fc%2Fl&claim=x");
    expect(await get(`token_hash=abc&type=email&next=${wrapped}`)).toBe(
      "http://localhost:3000/login?error=confirm_expired&next=%2Fcourses%2Fc%2Fl",
    );
  });

  it("recovery failures do not carry /reset-password", async () => {
    expect(await get("token_hash=abc&type=recovery&next=%2Freset-password")).toBe(
      "http://localhost:3000/login?error=recovery_expired",
    );
    expect(await get("code=abc&next=%2Freset-password")).toBe(
      "http://localhost:3000/login?error=recovery_expired",
    );
  });

  it("no next -> no next param", async () => {
    expect(await get("token_hash=abc&type=email")).toBe("http://localhost:3000/login?error=confirm_expired");
  });

  it("next=%40evil.com stays on-origin in every shape", async () => {
    for (const q of ["code=abc", "token_hash=abc&type=email"]) {
      const location = await get(`${q}&next=%40evil.com`);
      expect(new URL(location).origin).toBe("http://localhost:3000");
      expect(new URL(location).searchParams.get("next")).toBe("/@evil.com");
    }
  });
});
