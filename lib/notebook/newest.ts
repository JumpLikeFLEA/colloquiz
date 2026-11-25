/** A copy of `rows`, newest first by an ISO timestamp. Rows with equal times keep their order. */
export function newestFirst<T>(rows: readonly T[], at: (row: T) => string): T[] {
  return [...rows].sort((a, b) => Date.parse(at(b)) - Date.parse(at(a)));
}
