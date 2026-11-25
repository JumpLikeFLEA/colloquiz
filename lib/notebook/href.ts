import type { NotebookTab } from "./tabs";

export const NOTEBOOK_PATH = "/my/notebook";

/** The page with a tab and a course chosen. Defaults (Phrases, All courses) are left out of the URL. */
export function notebookHref(tab: NotebookTab, courseId: string | null): string {
  const params = new URLSearchParams();
  if (tab !== "phrases") params.set("tab", tab);
  if (courseId !== null) params.set("course", courseId);
  const query = params.toString();
  return query ? `${NOTEBOOK_PATH}?${query}` : NOTEBOOK_PATH;
}
