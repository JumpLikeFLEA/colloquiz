/**
 * Option-row classes for a `selection` item, shared by the player's
 * `SelectionRenderer` and the landing page's hero mini-demo
 * (`app/(english)/HeroDemo.tsx`, docs/decisions/0078). Lives in its own
 * module so the landing page can import it by direct path without pulling
 * the renderer (lib/items, dnd-free but still the player chunk) into `/`'s
 * bundle. Moved verbatim out of SelectionRenderer.tsx — no class changed.
 */
export function optionClassName({
  isSelected,
  submitted,
  feedback,
}: {
  isSelected: boolean;
  submitted: boolean;
  feedback: { wasSelected: boolean; isCorrect: boolean } | undefined;
}): string {
  const base =
    "flex w-full min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors";

  if (!submitted) {
    return `${base} cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-brand ${
      isSelected ? "border-brand bg-brand-subtle text-brand-text" : "border-border bg-background hover:border-brand/40"
    }`;
  }

  if (feedback?.wasSelected && feedback.isCorrect) {
    return `${base} border-success-border bg-success-subtle text-success`;
  }
  if (feedback?.wasSelected && !feedback.isCorrect) {
    return `${base} border-destructive-border bg-destructive-subtle text-destructive-text`;
  }
  if (!feedback?.wasSelected && feedback?.isCorrect) {
    return `${base} border-success-border bg-background text-success`;
  }
  return `${base} border-border bg-background text-muted-foreground opacity-70`;
}
