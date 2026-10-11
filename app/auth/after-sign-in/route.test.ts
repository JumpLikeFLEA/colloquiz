import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * SHELL-021 (docs/decisions/0109 Decision 4) — the password sign-in's
 * landing hop applies the same rule as /auth/callback. lib/auth.ts and
 * lib/studioEditor.ts are mocked; their own behaviour is tested elsewhere.
 */
const authUserFrom = vi.fn();
const isStudioEditor = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/auth", () => ({ authUserFrom: (...args: unknown[]) => authUserFrom(...args) }));
vi.mock("@/lib/studioEditor", () => ({ isStudioEditor: (...args: unknown[]) => isStudioEditor(...args) }));

afterEach(() => {
  authUserFrom.mockReset();
  isStudioEditor.mockReset();
});

async function get(url: string) {
  const { GET } = await import("./route");
  return GET(new NextRequest(url));
}

describe("GET /auth/after-sign-in", () => {
  it("an editor with next=/ goes to /studio, 303", async () => {
    authUserFrom.mockResolvedValue({ id: "u1", email: "a@b.c" });
    isStudioEditor.mockResolvedValue(true);

    const response = await get("http://localhost:3000/auth/after-sign-in?next=%2F");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/studio");
    expect(isStudioEditor).toHaveBeenCalledWith(expect.anything(), "u1");
  });

  it("a learner with next=/ goes to /", async () => {
    authUserFrom.mockResolvedValue({ id: "u2", email: null });
    isStudioEditor.mockResolvedValue(false);

    const response = await get("http://localhost:3000/auth/after-sign-in?next=%2F");
    expect(response.headers.get("location")).toBe("http://localhost:3000/");
  });

  it("a signed-out request goes to next with no editor check", async () => {
    authUserFrom.mockResolvedValue(null);

    const response = await get("http://localhost:3000/auth/after-sign-in");
    expect(response.headers.get("location")).toBe("http://localhost:3000/");
    expect(isStudioEditor).not.toHaveBeenCalled();
  });

  it("a deeper next wins without any auth read", async () => {
    const response = await get("http://localhost:3000/auth/after-sign-in?next=%2Fcourses%2Fc%2Fl");
    expect(response.headers.get("location")).toBe("http://localhost:3000/courses/c/l");
    expect(authUserFrom).not.toHaveBeenCalled();
  });

  it("an off-origin next is refused", async () => {
    authUserFrom.mockResolvedValue({ id: "u1", email: null });
    isStudioEditor.mockResolvedValue(true);

    const response = await get("http://localhost:3000/auth/after-sign-in?next=https%3A%2F%2Fevil.com");
    // safeNext turns it into "/", which for an editor is /studio, never evil.com.
    expect(response.headers.get("location")).toBe("http://localhost:3000/studio");
  });
});
