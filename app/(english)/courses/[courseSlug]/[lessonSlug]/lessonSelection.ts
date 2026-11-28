/**
 * PROG-023 (docs/decisions/0254) — which text selection on a lesson page counts for the Save bar,
 * and what it hands lib/notebook/selectionPhrase.
 *
 * A selection counts only when both its ends are inside the lesson scope (the `display: contents`
 * wrapper SignedInLessonPageClient draws round the band and the player) and neither is inside a
 * field, a contenteditable, a dnd-kit draggable or sortable (`aria-roledescription`), a dialog, the
 * strip or the bar.
 *
 * A selection inside an input or textarea reports the field's PARENT as its node, not something
 * inside the field (measured in both engines, 0254 step 0: anchor SPAN, activeElement INPUT), so
 * `closest("input")` misses it. The focused element is checked as well.
 *
 * The ends are the Range's start and end, never the Selection's anchor and focus: a backwards
 * selection (a handle dragged leftwards) swaps those, and the before/after context would come from
 * the wrong ends.
 */
export const LESSON_SCOPE_ATTR = "data-lesson-scope";
export const SELECTION_BAR_ATTR = "data-selection-bar";

const EXCLUDED = `input, textarea, select, [contenteditable]:not([contenteditable="false"]), [aria-roledescription], [role="dialog"], [${SELECTION_BAR_ATTR}]`;
/** What the phrase rule needs (lib/notebook/selectionPhrase). */
export type LessonSelection = { text: string; before: string; after: string };

function elementOf(node: Node): Element | null {
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
}

function fieldIsFocused(): boolean {
  const active = document.activeElement as HTMLElement | null;
  if (!active) return false;
  return active.matches("input, textarea, select") || active.isContentEditable;
}

function endCounts(node: Node, scope: Element, strip: Element | null): boolean {
  const el = elementOf(node);
  if (!el || !scope.contains(el)) return false;
  if (strip?.contains(el)) return false;
  return el.closest(EXCLUDED) === null;
}

/** The counting selection, or null. */
export function readLessonSelection(scope: Element, strip: Element | null): LessonSelection | null {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  if (fieldIsFocused()) return null;
  const range = selection.getRangeAt(0);
  if (!endCounts(range.startContainer, scope, strip) || !endCounts(range.endContainer, scope, strip)) return null;

  const start = range.startContainer;
  const end = range.endContainer;
  const before = start.nodeType === Node.TEXT_NODE ? (start.textContent ?? "").slice(0, range.startOffset) : "";
  const after = end.nodeType === Node.TEXT_NODE ? (end.textContent ?? "").slice(range.endOffset) : "";
  return { text: selection.toString(), before, after };
}
