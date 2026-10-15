// The take list's pure rules (VOICE-008, docs/decisions/0141 Decision 11).
// Takes live in React state only; this module decides what the list does so
// the component holds no rule of its own. Generic over the take shape so it
// needs no Blob or MediaRecorder under vitest.

/** Up to five takes per voice task per page visit (0141 Decision 11). */
export const MAX_TAKES = 5;

export type HasTakeId = { id: string };

export function takesFull(takes: readonly unknown[]): boolean {
  return takes.length >= MAX_TAKES;
}

/** Appends a take, or returns the same array when the list is full: a sixth
 * recording is refused, never silently dropping an older one. */
export function addTake<T extends HasTakeId>(takes: readonly T[], take: T): readonly T[] {
  return takesFull(takes) ? takes : [...takes, take];
}

/** The list without the take; the same array when no take has that id. */
export function removeTake<T extends HasTakeId>(takes: readonly T[], id: string): readonly T[] {
  return takes.some((t) => t.id === id) ? takes.filter((t) => t.id !== id) : takes;
}

export function findTake<T extends HasTakeId>(takes: readonly T[], id: string): T | null {
  return takes.find((t) => t.id === id) ?? null;
}
