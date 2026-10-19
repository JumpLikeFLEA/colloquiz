import type { AttemptsByLessonSlug, LessonAttemptSummary } from "../coursePageProgress";
import { ATTEMPT_STORAGE_KEY, type StoredAttempt } from "./attemptStore";
import { OPENS_STORAGE_KEY, parseOpens } from "./anonOpens";
import { bestPercentForVersion } from "./previousBest";

/**
 * PROG-003 (docs/decisions/0179) — what the course page knows about an
 * anonymous visitor, from the browser's own stores, in the shape the signed-in
 * path gets from `get_course_attempt_summary`, so `lessonRowProgress`,
 * `pickContinueLesson` and the rest are shared rather than copied.
 *
 * It restates 0143 for local data: a lesson with exercises is complete when
 * every exercise has a stored attempt for its CURRENT published version (the
 * count is `itemCount`, the page's `published_item_count`); a lesson with none
 * is complete when its version was opened here. A republish therefore resets
 * an anonymous visitor's lesson, which the server path does not: accepted,
 * the local store keeps no document to count against.
 */

export type AnonLesson = { slug: string; versionId: string; itemCount: number };

export function anonAttemptSummary(
  lessons: readonly AnonLesson[],
  attempts: readonly StoredAttempt[],
  opens: readonly string[],
): AttemptsByLessonSlug {
  const out: Record<string, LessonAttemptSummary> = {};
  for (const l of lessons) {
    if (l.itemCount === 0) {
      if (opens.includes(l.versionId)) {
        out[l.slug] = { bestPercent: null, complete: true, exercisesAnswered: 0, exercisesTotal: 0 };
      }
      continue;
    }
    const blocks = new Set<string>();
    for (const a of attempts) if (a.lessonVersionId === l.versionId) blocks.add(a.blockId);
    if (blocks.size === 0) continue;
    const complete = blocks.size >= l.itemCount;
    out[l.slug] = {
      bestPercent: complete ? bestPercentForVersion(attempts, l.versionId) : null,
      complete,
      exercisesAnswered: Math.min(blocks.size, l.itemCount),
      exercisesTotal: l.itemCount,
    };
  }
  return out;
}

/** The lesson whose version was opened most recently here, or null. */
export function anonLastOpenedSlug(lessons: readonly AnonLesson[], opens: readonly string[]): string | null {
  for (let i = opens.length - 1; i >= 0; i--) {
    const hit = lessons.find((l) => l.versionId === opens[i]);
    if (hit) return hit.slug;
  }
  return null;
}

const SEP = "\u0000";

/** The two stores' raw strings joined into one primitive, which is what
 * `useSyncExternalStore` needs for a snapshot that is stable between reads. */
export function anonStoreSnapshot(read: (key: string) => string | null): string {
  return `${read(ATTEMPT_STORAGE_KEY) ?? ""}${SEP}${read(OPENS_STORAGE_KEY) ?? ""}`;
}

export function parseAnonSnapshot(snapshot: string): { attempts: StoredAttempt[]; opens: string[] } {
  const [attemptsRaw, opensRaw] = snapshot.split(SEP);
  return { attempts: parseAttempts(attemptsRaw || null), opens: parseOpens(opensRaw || null) };
}

function parseAttempts(raw: string | null): StoredAttempt[] {
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw) as { version?: unknown; attempts?: unknown } | null;
    if (parsed?.version !== 1 || !Array.isArray(parsed.attempts)) return [];
    return parsed.attempts.filter(
      (a): a is StoredAttempt =>
        typeof a === "object" &&
        a !== null &&
        typeof (a as StoredAttempt).lessonVersionId === "string" &&
        typeof (a as StoredAttempt).blockId === "string" &&
        typeof (a as StoredAttempt).earned === "number" &&
        typeof (a as StoredAttempt).possible === "number",
    );
  } catch {
    return [];
  }
}
