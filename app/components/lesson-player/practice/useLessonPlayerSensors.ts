import {
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";

/**
 * The one dnd-kit sensor configuration shared by every drag-capable practice
 * renderer (`OrderingRenderer`, `DragSlots` in SlotsRenderer.tsx,
 * `MatchingRenderer`) — extracted verbatim from the three places it was
 * duplicated (docs/decisions/0032 Decision 1 for the first two; 0039 added
 * the third copy, in matching, and noted the duplication was deliberate at
 * the time, matching the repo's own precedent). The values themselves are
 * unchanged by this extraction — this hook only removes the copy-paste, not
 * the reasoning:
 *
 * `distance: 5` on `PointerSensor` keeps a plain tap/click from arming a
 * drag. `delay: 200, tolerance: 5` on `TouchSensor` is the touch-scroll
 * answer: a touch has to stay within `tolerance` px for `delay` ms before a
 * drag is armed, so a normal vertical swipe scrolls the page as always and
 * only a deliberate press-and-hold-then-move gesture starts a drag.
 *
 * `KeyboardSensor` takes an optional `coordinateGetter` — `OrderingRenderer`
 * passes `sortableKeyboardCoordinates` (from `@dnd-kit/sortable`) because it
 * operates over a `SortableContext`; `DragSlots` and `MatchingRenderer` have
 * no sortable list, just independent droppables, so they call this hook with
 * no argument and get dnd-kit's own default arrow-key coordinate stepping.
 */
export function useLessonPlayerSensors(coordinateGetter?: KeyboardCoordinateGetter) {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, coordinateGetter ? { coordinateGetter } : undefined),
  );
}
