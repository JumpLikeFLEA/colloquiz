/**
 * Which empty state the list shows, or null when it has rows:
 * - `notebook`: nothing anywhere, recordings and a summary included (the "Choose a course" state);
 * - `course`: this tab has rows, but not in the chosen course;
 * - `tab`: this tab has none in any course.
 */
export type EmptyState = "notebook" | "course" | "tab" | null;

export function emptyState(input: { notebookEmpty: boolean; shown: number; inAllCourses: number }): EmptyState {
  if (input.notebookEmpty) return "notebook";
  if (input.shown > 0) return null;
  return input.inAllCourses > 0 ? "course" : "tab";
}
