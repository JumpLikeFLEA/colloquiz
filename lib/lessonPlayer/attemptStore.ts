import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ANON-002 — the client-side half of 0048 (docs/decisions/0048): a
 * localStorage-backed store for practice-block attempts recorded before (or
 * without) an account, plus the upload path that empties it into the
 * ANON-003 record RPC once a session exists.
 *
 * Every attempt is stored, never only the best (docs/handoff.md, "Scoring
 * and progress": "Every attempt is stored; the best is what is shown"), so
 * `bestForBlock` is a derived read over the full history — it can only ever
 * report the same or a higher number as more attempts are recorded, which is
 * what makes "never lowers a visible number" true by construction rather
 * than by an overwrite rule this module would have to get right.
 *
 * The RPC name and payload shape (`record_lesson_attempts`, a JSONB array)
 * are this card's own decision, not settled in 0048 — see
 * docs/decisions/0063-anon002-attempt-store.md. ANON-003 must implement the
 * RPC to match.
 */

export const ATTEMPT_STORAGE_KEY = "alliengll.attempts.v1";
const SCHEMA_VERSION = 1;

export type StoredAttempt = {
  /** Client-generated UUID (0048 Decision 3) — what the record RPC keys its
   * idempotency on. */
  attemptId: string;
  lessonVersionId: string;
  blockId: string;
  earned: number;
  possible: number;
  /** ISO 8601. Informational only (ordering in a future review UI); nothing
   * here scores or sorts by it today. */
  recordedAt: string;
};

type StoredPayload = {
  version: number;
  attempts: StoredAttempt[];
};

/** The subset of the `Storage` DOM interface this module needs, so tests
 * (the "unit" vitest project runs under node — docs/decisions/0004, no
 * jsdom/`localStorage`) can inject a plain object or a throwing stand-in
 * without pulling in a browser environment. */
export interface AttemptStorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isStoredAttempt(value: unknown): value is StoredAttempt {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.attemptId === "string" &&
    typeof v.lessonVersionId === "string" &&
    typeof v.blockId === "string" &&
    typeof v.earned === "number" &&
    typeof v.possible === "number" &&
    typeof v.recordedAt === "string"
  );
}

/** Parses a raw payload string into a list of attempts. Never throws: bad
 * JSON, a payload shaped as something else entirely, or one stamped with a
 * schema version this module doesn't recognise (a future migration's job,
 * not this one's) all degrade to "no attempts yet" rather than an error. */
function parsePayload(raw: string | null): StoredAttempt[] {
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (typeof parsed !== "object" || parsed === null) return [];
  const payload = parsed as Partial<StoredPayload>;
  if (payload.version !== SCHEMA_VERSION || !Array.isArray(payload.attempts)) return [];
  return payload.attempts.filter(isStoredAttempt);
}

function resolveBackend(backend?: AttemptStorageBackend): AttemptStorageBackend | null {
  if (backend) return backend;
  if (typeof window === "undefined" || !window.localStorage) return null;
  return window.localStorage;
}

function tryGetItem(backend: AttemptStorageBackend | null): string | null {
  if (!backend) return null;
  try {
    return backend.getItem(ATTEMPT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function percentOf(a: StoredAttempt): number {
  return a.possible > 0 ? a.earned / a.possible : 0;
}

export type NewAttempt = Omit<StoredAttempt, "recordedAt"> & { recordedAt?: string };

export type AttemptStore = {
  record(attempt: NewAttempt): void;
  getAll(): StoredAttempt[];
  /** The highest-scoring attempt stored for this block, or null if it has
   * never been attempted. */
  bestForBlock(lessonVersionId: string, blockId: string): StoredAttempt | null;
  clear(): void;
};

/**
 * Creates a store bound to `backend` (real `localStorage` by default, or
 * in-memory when unavailable — SSR, a disabled/full storage, or a private-
 * mode browser that throws on access). Once storage proves unwritable for
 * any single `record`, that record still lands in the in-memory list
 * `getAll`/`bestForBlock` read from; only the browser's own persistence
 * across page loads is lost, never the current page's data.
 */
export function createAttemptStore(backend?: AttemptStorageBackend): AttemptStore {
  const resolved = resolveBackend(backend);
  let attempts: StoredAttempt[] = parsePayload(tryGetItem(resolved));

  function persist(): void {
    if (!resolved) return;
    const payload: StoredPayload = { version: SCHEMA_VERSION, attempts };
    try {
      resolved.setItem(ATTEMPT_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Storage unavailable or full: `attempts` above remains the source of
      // truth for the rest of this page's life, just not persisted.
    }
  }

  return {
    record(attempt) {
      attempts = [...attempts, { ...attempt, recordedAt: attempt.recordedAt ?? new Date().toISOString() }];
      persist();
    },
    getAll() {
      return attempts;
    },
    bestForBlock(lessonVersionId, blockId) {
      const matches = attempts.filter(
        (a) => a.lessonVersionId === lessonVersionId && a.blockId === blockId,
      );
      if (matches.length === 0) return null;
      return matches.reduce((best, a) => (percentOf(a) > percentOf(best) ? a : best));
    },
    clear() {
      attempts = [];
      persist();
    },
  };
}

/** The `record_lesson_attempts` RPC's own field names, shared by the
 * default-path upload below and ANON-004's cross-browser `pending_claims`
 * create call — both send the same shape, just through different transports
 * (a direct RPC call vs. a JSON body forwarded to the create endpoint, which
 * hands it unchanged to `claim_pending_claim` -> `record_lesson_attempts`
 * once claimed). */
export function toRecordAttemptPayload(
  attempts: readonly Pick<StoredAttempt, "attemptId" | "lessonVersionId" | "blockId" | "earned" | "possible">[],
) {
  return attempts.map((a) => ({
    attempt_id: a.attemptId,
    lesson_version_id: a.lessonVersionId,
    block_id: a.blockId,
    earned: a.earned,
    possible: a.possible,
  }));
}

export type UploadResult = "uploaded" | "no-session" | "empty";

/**
 * The default path of 0048 Decision 1: whenever an authenticated session
 * already exists in this browser, empty the local store into the ANON-003
 * record RPC and clear on success. Covers OAuth, a same-browser email
 * confirmation, and any later login on a browser still holding unsynced
 * attempts — all three just mean "a session already exists" from here.
 *
 * Deliberately does NOT run on a schedule or a timer; callers decide when to
 * try (e.g. once on mount of an authenticated route, or right after a
 * sign-in). A failed upload leaves the local store untouched, so the next
 * call retries the same attempts — safe because the RPC is idempotent on
 * `attemptId` (0048 Decision 3).
 */
export async function uploadPendingAttempts(
  store: AttemptStore,
  supabase: SupabaseClient,
): Promise<UploadResult> {
  const attempts = store.getAll();
  if (attempts.length === 0) return "empty";

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return "no-session";

  const { error } = await supabase.rpc("record_lesson_attempts", {
    p_attempts: toRecordAttemptPayload(attempts),
  });
  if (error) throw new Error(error.message);

  store.clear();
  return "uploaded";
}
