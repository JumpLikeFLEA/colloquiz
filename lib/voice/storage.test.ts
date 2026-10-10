import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { VOICE_BUCKET, VOICE_SIGNED_URL_TTL_SECONDS } from "./recording";
import { VOICE_REMOVE_BATCH, removeVoiceObjects, signVoicePlaybackUrl } from "./storage";

function fakeClient(opts: {
  removeError?: (batch: string[]) => boolean;
  markError?: boolean;
  signError?: boolean;
}) {
  const removeCalls: string[][] = [];
  const markCalls: string[][] = [];
  const signCalls: [string, number][] = [];
  const client = {
    storage: {
      from: (bucket: string) => {
        expect(bucket).toBe(VOICE_BUCKET);
        return {
          remove: async (batch: string[]) => {
            removeCalls.push(batch);
            return opts.removeError?.(batch) ? { data: null, error: new Error("boom") } : { data: [], error: null };
          },
          createSignedUrl: async (name: string, ttl: number) => {
            signCalls.push([name, ttl]);
            return opts.signError
              ? { data: null, error: new Error("Object not found") }
              : { data: { signedUrl: `https://x/${name}?token=t` }, error: null };
          },
        };
      },
    },
    rpc: vi.fn(async (_fn: string, args: { p_names: string[] }) => {
      markCalls.push(args.p_names);
      return { data: args.p_names.length, error: opts.markError ? new Error("mark") : null };
    }),
  } as unknown as SupabaseClient;
  return { client, removeCalls, markCalls, signCalls };
}

describe("removeVoiceObjects", () => {
  it("removes in batches, de-duplicated, and marks each removed batch", async () => {
    const names = Array.from({ length: VOICE_REMOVE_BATCH + 5 }, (_, i) => `n${i}`);
    const { client, removeCalls, markCalls } = fakeClient({});
    const res = await removeVoiceObjects(client, [...names, "n0"]);
    expect(removeCalls.map((b) => b.length)).toEqual([VOICE_REMOVE_BATCH, 5]);
    expect(markCalls).toEqual(removeCalls);
    expect(res).toEqual({ removed: names, failed: [] });
  });

  it("does not mark a batch whose remove failed, so it stays due", async () => {
    const { client, markCalls } = fakeClient({ removeError: () => true });
    const res = await removeVoiceObjects(client, ["a", "b"]);
    expect(markCalls).toEqual([]);
    expect(res).toEqual({ removed: [], failed: ["a", "b"] });
  });

  it("reports a batch as failed when the mark fails", async () => {
    const { client } = fakeClient({ markError: true });
    expect(await removeVoiceObjects(client, ["a"])).toEqual({ removed: [], failed: ["a"] });
  });

  it("does nothing for an empty list", async () => {
    const { client, removeCalls } = fakeClient({});
    expect(await removeVoiceObjects(client, [])).toEqual({ removed: [], failed: [] });
    expect(removeCalls).toEqual([]);
  });
});

describe("signVoicePlaybackUrl", () => {
  it("signs with the stated TTL and reports when the URL expires", async () => {
    const { client, signCalls } = fakeClient({});
    const before = Date.now();
    const res = await signVoicePlaybackUrl(client, "c/u/s.webm");
    expect(signCalls).toEqual([["c/u/s.webm", VOICE_SIGNED_URL_TTL_SECONDS]]);
    expect(res?.url).toContain("c/u/s.webm");
    expect(res!.expiresAt.getTime()).toBeGreaterThanOrEqual(before + VOICE_SIGNED_URL_TTL_SECONDS * 1000);
  });

  it("returns null when storage refuses (the caller may not read it)", async () => {
    const { client } = fakeClient({ signError: true });
    expect(await signVoicePlaybackUrl(client, "c/u/s.webm")).toBeNull();
  });
});
