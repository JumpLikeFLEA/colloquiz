import { describe, expect, it, vi } from "vitest";
import {
  ATTEMPT_STORAGE_KEY,
  createAttemptStore,
  toRecordAttemptPayload,
  uploadPendingAttempts,
  type AttemptStorageBackend,
} from "./attemptStore";

function memoryBackend(initial?: Record<string, string>): AttemptStorageBackend & { store: Record<string, string> } {
  const store: Record<string, string> = { ...initial };
  return {
    store,
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => {
      store[key] = value;
    },
  };
}

function throwingBackend(): AttemptStorageBackend {
  return {
    getItem: () => {
      throw new Error("storage disabled");
    },
    setItem: () => {
      throw new Error("quota exceeded");
    },
  };
}

const attempt1 = { attemptId: "a1", lessonVersionId: "v1", blockId: "b1", earned: 1, possible: 2 };
const attempt2 = { attemptId: "a2", lessonVersionId: "v1", blockId: "b1", earned: 2, possible: 2 };

describe("createAttemptStore", () => {
  it("records an attempt and persists it to the backend", () => {
    const backend = memoryBackend();
    const store = createAttemptStore(backend);
    store.record(attempt1);

    expect(store.getAll()).toHaveLength(1);
    expect(store.getAll()[0]).toMatchObject(attempt1);
    expect(store.getAll()[0].recordedAt).toEqual(expect.any(String));

    const raw = backend.store[ATTEMPT_STORAGE_KEY];
    expect(raw).toBeDefined();
    expect(JSON.parse(raw)).toMatchObject({ version: 1, attempts: [{ attemptId: "a1" }] });
  });

  it("loads previously stored attempts from the backend on creation", () => {
    const backend = memoryBackend({
      [ATTEMPT_STORAGE_KEY]: JSON.stringify({ version: 1, attempts: [attempt1].map((a) => ({ ...a, recordedAt: "2026-01-01T00:00:00.000Z" })) }),
    });
    const store = createAttemptStore(backend);
    expect(store.getAll()).toHaveLength(1);
    expect(store.getAll()[0].attemptId).toBe("a1");
  });

  it("discards an unparseable payload rather than throwing", () => {
    const backend = memoryBackend({ [ATTEMPT_STORAGE_KEY]: "{not json" });
    const store = createAttemptStore(backend);
    expect(store.getAll()).toEqual([]);
  });

  it("discards a payload with an unrecognised schema version rather than throwing", () => {
    const backend = memoryBackend({
      [ATTEMPT_STORAGE_KEY]: JSON.stringify({ version: 99, attempts: [{ ...attempt1, recordedAt: "x" }] }),
    });
    const store = createAttemptStore(backend);
    expect(store.getAll()).toEqual([]);
  });

  it("discards malformed entries within an otherwise valid payload", () => {
    const backend = memoryBackend({
      [ATTEMPT_STORAGE_KEY]: JSON.stringify({
        version: 1,
        attempts: [{ ...attempt1, recordedAt: "2026-01-01T00:00:00.000Z" }, { garbage: true }],
      }),
    });
    const store = createAttemptStore(backend);
    expect(store.getAll()).toHaveLength(1);
  });

  it("never throws when the backend is unavailable or full, and keeps serving from memory", () => {
    const backend = throwingBackend();
    expect(() => {
      const store = createAttemptStore(backend);
      store.record(attempt1);
      store.record(attempt2);
    }).not.toThrow();

    const store = createAttemptStore(backend);
    store.record(attempt1);
    expect(store.getAll()).toHaveLength(1);
    expect(store.getAll()[0]).toMatchObject(attempt1);
  });

  it("falls back to an in-memory store when no backend is available (e.g. SSR)", () => {
    expect(() => {
      const store = createAttemptStore(undefined);
      store.record(attempt1);
      expect(store.getAll()).toHaveLength(1);
    }).not.toThrow();
  });

  describe("bestForBlock", () => {
    it("returns null for a block never attempted", () => {
      const store = createAttemptStore(memoryBackend());
      expect(store.bestForBlock("v1", "b1")).toBeNull();
    });

    it("returns the highest-scoring attempt across retakes, never a lower one", () => {
      const store = createAttemptStore(memoryBackend());
      store.record(attempt2); // 2/2 first
      store.record(attempt1); // 1/2 second — must not overwrite the best
      expect(store.bestForBlock("v1", "b1")?.attemptId).toBe("a2");
    });

    it("ignores attempts for other blocks or lesson versions", () => {
      const store = createAttemptStore(memoryBackend());
      store.record(attempt1);
      store.record({ ...attempt2, blockId: "other-block" });
      store.record({ ...attempt2, lessonVersionId: "other-version" });
      expect(store.bestForBlock("v1", "b1")?.attemptId).toBe("a1");
    });
  });

  it("clear empties the store and the backend", () => {
    const backend = memoryBackend();
    const store = createAttemptStore(backend);
    store.record(attempt1);
    store.clear();
    expect(store.getAll()).toEqual([]);
    expect(JSON.parse(backend.store[ATTEMPT_STORAGE_KEY]).attempts).toEqual([]);
  });
});

describe("toRecordAttemptPayload", () => {
  it("maps stored attempts to record_lesson_attempts's own snake_case field names", () => {
    expect(toRecordAttemptPayload([attempt1, attempt2])).toEqual([
      { attempt_id: "a1", lesson_version_id: "v1", block_id: "b1", earned: 1, possible: 2 },
      { attempt_id: "a2", lesson_version_id: "v1", block_id: "b1", earned: 2, possible: 2 },
    ]);
  });

  it("maps an empty list to an empty list", () => {
    expect(toRecordAttemptPayload([])).toEqual([]);
  });
});

function fakeSupabase(opts: { session: object | null; rpcError?: { message: string } }) {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: opts.rpcError ?? null });
  return {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: opts.session } }) },
    rpc,
  } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

describe("uploadPendingAttempts", () => {
  it("returns 'empty' and makes no calls when there is nothing stored", async () => {
    const store = createAttemptStore(memoryBackend());
    const supabase = fakeSupabase({ session: { user: { id: "u1" } } });
    const result = await uploadPendingAttempts(store, supabase);
    expect(result).toBe("empty");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("returns 'no-session' and leaves local attempts untouched when unauthenticated", async () => {
    const store = createAttemptStore(memoryBackend());
    store.record(attempt1);
    const supabase = fakeSupabase({ session: null });

    const result = await uploadPendingAttempts(store, supabase);

    expect(result).toBe("no-session");
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(store.getAll()).toHaveLength(1);
  });

  it("uploads through record_lesson_attempts and clears local storage on success", async () => {
    const store = createAttemptStore(memoryBackend());
    store.record(attempt1);
    store.record(attempt2);
    const supabase = fakeSupabase({ session: { user: { id: "u1" } } });

    const result = await uploadPendingAttempts(store, supabase);

    expect(result).toBe("uploaded");
    expect(supabase.rpc).toHaveBeenCalledWith("record_lesson_attempts", {
      p_attempts: [
        { attempt_id: "a1", lesson_version_id: "v1", block_id: "b1", earned: 1, possible: 2 },
        { attempt_id: "a2", lesson_version_id: "v1", block_id: "b1", earned: 2, possible: 2 },
      ],
    });
    expect(store.getAll()).toEqual([]);
  });

  it("throws and keeps local attempts when the RPC errors, so a retry can pick them up", async () => {
    const store = createAttemptStore(memoryBackend());
    store.record(attempt1);
    const supabase = fakeSupabase({ session: { user: { id: "u1" } }, rpcError: { message: "boom" } });

    await expect(uploadPendingAttempts(store, supabase)).rejects.toThrow("boom");
    expect(store.getAll()).toHaveLength(1);
  });
});
