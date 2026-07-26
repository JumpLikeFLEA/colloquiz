import type { Difficulty } from "@/types";

/**
 * Quick Play's page-level difficulty filter.
 *
 * Difficulty is chosen once for the whole page rather than per subject card:
 * twelve subjects × four pills was ~48 controls for a single decision. It lives
 * in the `?difficulty=` search param so the choice is shareable and survives a
 * refresh — the same pattern as the review queue and the Progress tabs. (Quick
 * Play's search box deliberately stays client-side: it's a transient narrowing,
 * not structural state.)
 *
 * Lives in lib/ rather than beside the grid because the server component reads
 * the param: every export of a "use client" module is a client reference on the
 * server, so a parser defined there could not be called while rendering.
 */
export const DIFFICULTY_FILTERS = [
  { value: "any", label: "Any" },
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
] as const;

export type DifficultyFilter = (typeof DIFFICULTY_FILTERS)[number]["value"];

/**
 * Allow-list read of the search param: anything absent or unrecognized
 * ("", "nonsense", "HARD") lands on "any" rather than emptying the grid.
 */
export function parseDifficultyFilter(raw: string | undefined): DifficultyFilter {
  return DIFFICULTY_FILTERS.some((d) => d.value === raw)
    ? (raw as DifficultyFilter)
    : "any";
}

/**
 * "any" is the UI/URL spelling; "mixed" is what the quiz API has always called
 * the same thing (Random Quiz and the Build wizard send it too).
 */
export function toQuizDifficulty(filter: DifficultyFilter): Difficulty | "mixed" {
  return filter === "any" ? "mixed" : filter;
}
