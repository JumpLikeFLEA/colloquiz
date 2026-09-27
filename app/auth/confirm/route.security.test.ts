import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Route-level check for the open redirect pre-push review found in
 * ANON-004: `next` used to reach `NextResponse.redirect(`${origin}${next}`)`
 * unvalidated. Mocks `@/lib/supabase/server` so `verifyOtp` "succeeds"
 * without a real Supabase call — this test is about what the route does
 * with `next` once verification succeeds, not about verification itself
 * (that's covered by manual/E2E testing against a real Supabase stack, per
 * docs/decisions/0068).
 */
const verifyOtp = vi.fn().mockResolvedValue({ error: null });
const rpc = vi.fn().mockResolvedValue({ data: null, error: null });

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { verifyOtp }, rpc }),
}));

afterEach(() => {
  verifyOtp.mockClear();
  rpc.mockClear();
});

describe("GET /auth/confirm — safeNext at the redirect sink", () => {
  it("next=%40evil.com does not redirect off-origin", async () => {
    const { GET } = await import("./route");
    const request = new NextRequest(
      "http://localhost:3000/auth/confirm?token_hash=abc&type=email&next=%40evil.com",
    );
    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = response.headers.get("location")!;
    expect(new URL(location).origin).toBe("http://localhost:3000");
    expect(location).toBe("http://localhost:3000/@evil.com");
  });

  it("a legitimate same-origin next still works", async () => {
    const { GET } = await import("./route");
    const request = new NextRequest(
      "http://localhost:3000/auth/confirm?token_hash=abc&type=email&next=%2Fcourses%2Fx%2Fy",
    );
    const response = await GET(request);

    expect(response.headers.get("location")).toBe("http://localhost:3000/courses/x/y");
  });
});
