import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * ANON-009 (docs/decisions/0081) — /auth/confirm records the signup's
 * acquisition only on the token_hash branch (a genuine new-account signup,
 * per 0069), only when a source arrived, and never changes the redirect.
 * Supabase is mocked: this is about what the route does after verification,
 * not verification itself (that is the local-stack protocol on issue 135).
 */
const verifyOtp = vi.fn();
const exchangeCodeForSession = vi.fn();
const rpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { verifyOtp, exchangeCodeForSession }, rpc }),
}));
vi.mock("@/lib/funnelEventServer", () => ({
  recordServerFunnelEvent: vi.fn().mockResolvedValue(undefined),
}));

function acquisitionCalls() {
  return rpc.mock.calls.filter(([name]) => name === "record_signup_acquisition");
}

afterEach(() => {
  verifyOtp.mockReset();
  exchangeCodeForSession.mockReset();
  rpc.mockReset();
});

async function get(url: string) {
  const { GET } = await import("./route");
  return GET(new NextRequest(url));
}

describe("GET /auth/confirm — signup acquisition", () => {
  it("token_hash success records source + course slug, then redirects to next", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    rpc.mockResolvedValue({ data: { ok: true, recorded: true }, error: null });

    const response = await get(
      "http://localhost:3000/auth/confirm?token_hash=abc&type=email&next=%2Fcourses%2Fc%2Fl&source=telegram",
    );

    expect(acquisitionCalls()).toEqual([
      ["record_signup_acquisition", { p_source: "telegram", p_course_slug: "c" }],
    ]);
    expect(response.headers.get("location")).toBe("http://localhost:3000/courses/c/l");
  });

  it("reads source and next from inside the wrapped RegistrationOffer URL (cross-browser confirmation)", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    rpc.mockResolvedValue({ data: { ok: true, recorded: true }, error: null });
    const wrapped = encodeURIComponent(
      "http://localhost:3000/auth/confirm?next=%2Fcourses%2Ffuture-imperfect%2Flesson-3&source=instagram",
    );

    const response = await get(`http://localhost:3000/auth/confirm?token_hash=abc&type=email&next=${wrapped}`);

    expect(acquisitionCalls()).toEqual([
      ["record_signup_acquisition", { p_source: "instagram", p_course_slug: "future-imperfect" }],
    ]);
    expect(response.headers.get("location")).toBe("http://localhost:3000/courses/future-imperfect/lesson-3");
  });

  it("no source (opt-out, or AuthScreen's unthreaded signup) → no call", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    rpc.mockResolvedValue({ data: null, error: null });

    await get("http://localhost:3000/auth/confirm?token_hash=abc&type=email&next=%2Fcourses%2Fc%2Fl");

    expect(verifyOtp).toHaveBeenCalled();
    expect(acquisitionCalls()).toEqual([]);
  });

  it("an unrecognised source is dropped to null → no call", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    rpc.mockResolvedValue({ data: null, error: null });

    await get("http://localhost:3000/auth/confirm?token_hash=abc&type=email&next=%2F&source=facebook");

    expect(acquisitionCalls()).toEqual([]);
  });

  it("the code branch (recovery / second-device confirm, not a signup) → no call", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    rpc.mockResolvedValue({ data: null, error: null });

    await get("http://localhost:3000/auth/confirm?code=xyz&next=%2Fcourses%2Fc%2Fl&source=telegram");

    expect(exchangeCodeForSession).toHaveBeenCalled();
    expect(acquisitionCalls()).toEqual([]);
  });

  it("failed verification → no call", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "expired" } });

    const response = await get(
      "http://localhost:3000/auth/confirm?token_hash=abc&type=email&next=%2Fcourses%2Fc%2Fl&source=telegram",
    );

    expect(acquisitionCalls()).toEqual([]);
    expect(response.headers.get("location")).toBe("http://localhost:3000/login?error=confirm_expired&next=%2Fcourses%2Fc%2Fl");
  });

  it("an RPC error or throw leaves the redirect unchanged", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    verifyOtp.mockResolvedValue({ error: null });
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const errored = await get(
      "http://localhost:3000/auth/confirm?token_hash=abc&type=email&next=%2Fcourses%2Fc%2Fl&source=telegram",
    );
    expect(errored.headers.get("location")).toBe("http://localhost:3000/courses/c/l");

    rpc.mockRejectedValueOnce(new Error("network down"));
    const thrown = await get(
      "http://localhost:3000/auth/confirm?token_hash=abc&type=email&next=%2Fcourses%2Fc%2Fl&source=telegram",
    );
    expect(thrown.headers.get("location")).toBe("http://localhost:3000/courses/c/l");
  });
});
