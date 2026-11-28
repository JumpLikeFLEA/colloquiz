/**
 * PROG-024 (docs/decisions/0256) — where the Save chip goes, given the selection and the chip's
 * size. Pure: document coordinates in, document coordinates out, so the chip can sit in <body> as
 * `position: absolute` and move with the text when the page scrolls, with no scroll listener.
 *
 * - Below the selection's LAST line, `CHIP_GAP` px under its bottom: room for the phone's selection
 *   handle. Hypothesis, unverified: a phone draws its own menu ABOVE the selection, so below is
 *   free. The gap is not checked against a real handle.
 * - Centred on the end of the selection, clamped `CHIP_EDGE` px inside the viewport's sides.
 * - Flipped above the selection's FIRST line when below would end past the viewport's bottom
 *   (less `CHIP_EDGE`), and then kept at least `CHIP_EDGE` under the viewport's top.
 */
export const CHIP_GAP = 28;
export const CHIP_EDGE = 16;

/** The selection, in document coordinates (client rect + scroll offset, read when it changed). */
export type ChipAnchor = {
  /** Top of the selection's first line. */
  top: number;
  /** Bottom of the selection's last line. */
  bottom: number;
  /** x of the selection's end (its last rect's right edge). */
  endX: number;
};

export type ChipViewport = { width: number; height: number; scrollX: number; scrollY: number };

export type ChipPlacement = { left: number; top: number; flipped: boolean };

export function placeChip(anchor: ChipAnchor, chip: { width: number; height: number }, vp: ChipViewport): ChipPlacement {
  const minLeft = vp.scrollX + CHIP_EDGE;
  const maxLeft = vp.scrollX + vp.width - CHIP_EDGE - chip.width;
  const left = Math.max(minLeft, Math.min(maxLeft, anchor.endX - chip.width / 2));

  const below = anchor.bottom + CHIP_GAP;
  const viewportBottom = vp.scrollY + vp.height - CHIP_EDGE;
  if (below + chip.height <= viewportBottom) return { left, top: below, flipped: false };
  const above = Math.max(vp.scrollY + CHIP_EDGE, anchor.top - CHIP_GAP - chip.height);
  return { left, top: above, flipped: true };
}
