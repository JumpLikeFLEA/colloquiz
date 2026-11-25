export const NOTEBOOK_TABS = ["phrases", "fixes", "to-try"] as const;
export type NotebookTab = (typeof NOTEBOOK_TABS)[number];

/** `?tab=`, allow-listed: anything else is Phrases. */
export function parseTab(raw: unknown): NotebookTab {
  return NOTEBOOK_TABS.find((t) => t === raw) ?? "phrases";
}
