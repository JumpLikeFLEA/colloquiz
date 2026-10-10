import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordLessonOpen } from "./lessonOpen";

function fakeSupabase(opts: {
  session: object | null;
  data?: unknown;
  rpcError?: { message: string };
}) {
  const rpc = vi.fn().mockResolvedValue({ data: opts.data ?? null, error: opts.rpcError ?? null });
  const client = {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: opts.session } }) },
    rpc,
  };
  return client as unknown as SupabaseClient & { rpc: typeof rpc };
}

describe("recordLessonOpen", () => {
  it("records the open for a signed-in learner, keyed by the lesson version", async () => {
    const supabase = fakeSupabase({ session: { user: {} }, data: { ok: true } });
    await expect(recordLessonOpen(supabase, "v-1")).resolves.toBe("recorded");
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith("record_lesson_open", { p_lesson_version_id: "v-1" });
  });

  it("makes no call without a lesson version (preview, demo)", async () => {
    const supabase = fakeSupabase({ session: { user: {} }, data: { ok: true } });
    await expect(recordLessonOpen(supabase, "")).resolves.toBe("skipped");
    expect(supabase.auth.getSession).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("makes no call without a session", async () => {
    const supabase = fakeSupabase({ session: null, data: { ok: true } });
    await expect(recordLessonOpen(supabase, "v-1")).resolves.toBe("no-session");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("reports a refusal without throwing", async () => {
    const supabase = fakeSupabase({ session: { user: {} }, data: { ok: false, error: "not_readable" } });
    await expect(recordLessonOpen(supabase, "v-1")).resolves.toBe("refused");
  });

  it("throws on a transport error", async () => {
    const supabase = fakeSupabase({ session: { user: {} }, rpcError: { message: "boom" } });
    await expect(recordLessonOpen(supabase, "v-1")).rejects.toThrow("boom");
  });
});
