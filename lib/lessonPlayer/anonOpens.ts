/**
 * PROG-003 (docs/decisions/0179) — the anonymous counterpart of
 * `lesson_opens` (056): which lesson VERSIONS this browser has opened, oldest
 * first. A lesson with no exercises produces no attempt, so without it an
 * anonymous visitor could never complete a theory-only lesson and "Continue"
 * would stop on it for good (the failure PROG-004 / 0143 describe).
 *
 * Not uploaded on sign-in: there is no RPC for it, and 0143 accepts that a
 * theory-only lesson read anonymously counts once reopened while signed in.
 * Same storage posture as attemptStore.ts: every access is guarded, and a
 * blocked or full store degrades to "nothing opened".
 */

export const OPENS_STORAGE_KEY = "alliengll.opens.v1";
const SCHEMA_VERSION = 1;
const MAX_OPENS = 200;

export interface OpensStorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Version ids, oldest first. Never throws: anything unreadable is "none". */
export function parseOpens(raw: string | null): string[] {
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return [];
    const p = parsed as { version?: unknown; opens?: unknown };
    if (p.version !== SCHEMA_VERSION || !Array.isArray(p.opens)) return [];
    return p.opens.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

/** `versionId` moved to the end (most recent), duplicates dropped, capped. */
export function withOpen(opens: readonly string[], versionId: string): string[] {
  return [...opens.filter((v) => v !== versionId), versionId].slice(-MAX_OPENS);
}

function defaultBackend(): OpensStorageBackend | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Records that this browser opened `lessonVersionId`. Best-effort. */
export function recordAnonOpen(lessonVersionId: string, backend: OpensStorageBackend | null = defaultBackend()): void {
  if (!lessonVersionId || !backend) return;
  try {
    const next = withOpen(parseOpens(backend.getItem(OPENS_STORAGE_KEY)), lessonVersionId);
    backend.setItem(OPENS_STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, opens: next }));
  } catch {
    // Storage unavailable or full: opening a lesson must never fail on this.
  }
}
