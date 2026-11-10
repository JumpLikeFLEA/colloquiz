import { WRITING_ANSWER_MAX_CHARS } from "../lessons/taskBlocks";

/**
 * WRITE-001 (docs/decisions/0225 Decision 3, key named in Decision 3's
 * addendum in the decision file): a practice answer to a writing task is kept
 * as a draft in this browser so a reload does not lose a long story. It is
 * never uploaded.
 *
 * Key: `alliengll.writing.draft.v1:<lesson path>:<block id>`. The lesson path
 * (not the version id) so a republished lesson keeps its drafts; the block id
 * because a lesson may hold several tasks. Same posture as attemptStore.ts:
 * every access is guarded, and a blocked, full or throwing store degrades to
 * an in-memory draft for this page load.
 */

export const WRITING_DRAFT_KEY_PREFIX = "alliengll.writing.draft.v1";

export interface DraftBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function writingDraftKey(lessonPath: string, blockId: string): string {
  return `${WRITING_DRAFT_KEY_PREFIX}:${lessonPath}:${blockId}`;
}

/** The text stored under `raw`, or "" for anything unreadable or oversized. */
export function parseDraft(raw: string | null): string {
  if (raw === null) return "";
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return "";
    const p = parsed as { v?: unknown; text?: unknown };
    if (p.v !== 1 || typeof p.text !== "string") return "";
    return p.text.slice(0, WRITING_ANSWER_MAX_CHARS);
  } catch {
    return "";
  }
}

export function defaultDraftBackend(): DraftBackend | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

/** A draft store for one lesson and block. `persist` false (the Studio
 * preview) keeps the text in memory only. */
export function createDraftStore(
  key: string | null,
  backend: DraftBackend | null = defaultDraftBackend(),
) {
  let memory = "";
  return {
    read(): string {
      if (key && backend) {
        try {
          memory = parseDraft(backend.getItem(key));
        } catch {
          // Storage blocked: fall through to the in-memory value.
        }
      }
      return memory;
    },
    write(text: string): void {
      memory = text.slice(0, WRITING_ANSWER_MAX_CHARS);
      if (!key || !backend) return;
      try {
        if (memory === "") backend.removeItem(key);
        else backend.setItem(key, JSON.stringify({ v: 1, text: memory }));
      } catch {
        // Full or blocked: the draft lives in memory for this page load.
      }
    },
  };
}
