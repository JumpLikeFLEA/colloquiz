import { afterEach, describe, expect, it, vi } from "vitest";
import { isDuplicateUpload, postVoiceSubmission, sendVoiceTake, storageObjectUrl, type SendDeps } from "./send";

const input = {
  supabaseUrl: "http://127.0.0.1:54321",
  anonKey: "anon",
  take: new Blob(["x"]),
  contentType: "audio/ogg",
  submissionId: "s1",
  objectName: "c/u/s1.ogg",
  lessonId: "l1",
  blockId: "v1",
  onProgress: () => {},
};

function deps(over: Partial<SendDeps> = {}): SendDeps {
  return {
    getAccessToken: vi.fn().mockResolvedValue("jwt"),
    upload: vi.fn().mockResolvedValue("uploaded"),
    submit: vi.fn().mockResolvedValue({ status: 200, error: null }),
    ...over,
  };
}

describe("sendVoiceTake", () => {
  it("uploads with the learner's token and the resolved content type, then submits the same names", async () => {
    const d = deps();
    expect(await sendVoiceTake(input, d)).toBe("sent");
    expect(d.upload).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "jwt", objectName: "c/u/s1.ogg", contentType: "audio/ogg" }),
    );
    expect(d.submit).toHaveBeenCalledWith({ submissionId: "s1", lessonId: "l1", blockId: "v1", objectName: "c/u/s1.ogg" });
  });

  it("no session: practice, and nothing is uploaded", async () => {
    const d = deps({ getAccessToken: vi.fn().mockResolvedValue(null) });
    expect(await sendVoiceTake(input, d)).toBe("practice");
    expect(d.upload).not.toHaveBeenCalled();
  });

  it("a failed upload is retryable and is never submitted", async () => {
    const d = deps({ upload: vi.fn().mockRejectedValue(new Error("network")) });
    expect(await sendVoiceTake(input, d)).toBe("upload_failed");
    expect(d.submit).not.toHaveBeenCalled();
  });

  it("a retry whose upload already landed goes on to submit", async () => {
    const d = deps({ upload: vi.fn().mockResolvedValue("exists") });
    expect(await sendVoiceTake(input, d)).toBe("sent");
    expect(d.submit).toHaveBeenCalled();
  });

  it("maps the RPC's refusals", async () => {
    expect(await sendVoiceTake(input, deps({ submit: vi.fn().mockResolvedValue({ status: 403, error: "not_enrolled" }) }))).toBe(
      "practice",
    );
    expect(await sendVoiceTake(input, deps({ submit: vi.fn().mockResolvedValue({ status: 409, error: "locked" }) }))).toBe("locked");
    expect(await sendVoiceTake(input, deps({ submit: vi.fn().mockRejectedValue(new Error("offline")) }))).toBe("retry");
  });

  it("maps a refusal by an AI feedback cap to 'capped', not 'retry'", async () => {
    const capped = vi.fn().mockResolvedValue({ status: 429, error: "voice_cap", cap: { kind: "task_cap", retryAt: null } });
    expect(await sendVoiceTake(input, deps({ submit: capped }))).toBe("capped");
  });
});

describe("postVoiceSubmission", () => {
  afterEach(() => vi.unstubAllGlobals());
  const answer = (status: number, body: unknown) =>
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status, json: async () => body }));
  const body = { submissionId: "s1", lessonId: "l1", blockId: "v1", objectName: "c/u/s1.ogg" };

  it("reads the cap kind and time from a voice_cap answer", async () => {
    answer(429, { ok: false, error: "voice_cap", kind: "daily_cap", retryAt: "2026-10-22T18:00:00.000Z" });
    expect(await postVoiceSubmission(body)).toEqual({
      status: 429,
      error: "voice_cap",
      cap: { kind: "daily_cap", retryAt: "2026-10-22T18:00:00.000Z" },
    });
    answer(429, { ok: false, error: "voice_cap", kind: "task_cap", retryAt: null });
    expect((await postVoiceSubmission(body)).cap).toEqual({ kind: "task_cap", retryAt: null });
  });

  it("gives no cap for any other answer, or for a cap kind it does not know", async () => {
    answer(500, { ok: false, error: "internal" });
    expect((await postVoiceSubmission(body)).cap).toBeNull();
    answer(429, { ok: false, error: "voice_cap", kind: "monthly_cap" });
    expect((await postVoiceSubmission(body)).cap).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 502, json: async () => Promise.reject(new Error("html")) }));
    expect(await postVoiceSubmission(body)).toEqual({ status: 502, error: null, cap: null });
  });
});

describe("isDuplicateUpload / storageObjectUrl", () => {
  it("recognises both shapes of Storage's duplicate answer", () => {
    expect(isDuplicateUpload(409, "")).toBe(true);
    expect(isDuplicateUpload(400, JSON.stringify({ statusCode: "409", error: "Duplicate" }))).toBe(true);
    expect(isDuplicateUpload(400, JSON.stringify({ statusCode: "403", error: "Unauthorized" }))).toBe(false);
    expect(isDuplicateUpload(400, "not json")).toBe(false);
    expect(isDuplicateUpload(500, "")).toBe(false);
  });

  it("builds the object URL in the voice bucket", () => {
    expect(storageObjectUrl("http://h:1/", "a/b/c.webm")).toBe("http://h:1/storage/v1/object/voice-recordings/a/b/c.webm");
  });
});
