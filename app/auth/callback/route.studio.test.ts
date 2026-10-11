import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * SHELL-021 (docs/decisions/0109 Decision 4) — an OAuth sign-in by an editor
 * with no deeper `next` lands on /studio; a deeper `next` wins and is not
 * even worth the editor check; a learner lands where `next` says.
 * lib/studioEditor.ts is mocked: its own reads are covered in
 * lib/studioEditor.test.ts.
 */
const exchangeCodeForSession = vi.fn();
const getUser = vi.fn();
const isStudioEditor = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession, getUser }, rpc: vi.fn() }),
}));
vi.mock("@/lib/funnelEventServer", () => ({
  recordServerFunnelEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/studioEditor", () => ({ isStudioEditor: (...args: unknown[]) => isStudioEditor(...args) }));

const OLD_ACCOUNT = { data: { user: { id: "u1", created_at: "2026-01-01T00:00:00Z" } } };

afterEach(() => {
  exchangeCodeForSession.mockReset();
  getUser.mockReset();
  isStudioEditor.mockReset();
});

async function location(url: string) {
  const { GET } = await import("./route");
  return (await GET(new NextRequest(url))).headers.get("location");
}

describe("GET /auth/callback — post-sign-in landing", () => {
  it("an editor with no next lands on /studio", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getUser.mockResolvedValue(OLD_ACCOUNT);
    isStudioEditor.mockResolvedValue(true);

    expect(await location("http://localhost:3000/auth/callback?code=xyz")).toBe("http://localhost:3000/studio");
    expect(isStudioEditor).toHaveBeenCalledWith(expect.anything(), "u1");
  });

  it("an editor with next=/ lands on /studio", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getUser.mockResolvedValue(OLD_ACCOUNT);
    isStudioEditor.mockResolvedValue(true);

    expect(await location("http://localhost:3000/auth/callback?code=xyz&next=%2F")).toBe(
      "http://localhost:3000/studio",
    );
  });

  it("a learner with next=/ lands on /", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getUser.mockResolvedValue(OLD_ACCOUNT);
    isStudioEditor.mockResolvedValue(false);

    expect(await location("http://localhost:3000/auth/callback?code=xyz&next=%2F")).toBe("http://localhost:3000/");
  });

  it("an editor with a lesson next lands on the lesson, with no editor check", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getUser.mockResolvedValue(OLD_ACCOUNT);
    isStudioEditor.mockResolvedValue(true);

    expect(await location("http://localhost:3000/auth/callback?code=xyz&next=%2Fcourses%2Fc%2Fl")).toBe(
      "http://localhost:3000/courses/c/l",
    );
    expect(isStudioEditor).not.toHaveBeenCalled();
  });
});
