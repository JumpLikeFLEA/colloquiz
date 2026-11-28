import { describe, expect, it } from "vitest";
import { CHIP_EDGE, CHIP_GAP, placeChip } from "./chipPlacement";

const vp = { width: 360, height: 800, scrollX: 0, scrollY: 0 };
const chip = { width: 200, height: 48 };

describe("placeChip (PROG-024, 0256)", () => {
  it("sits the gap under the last line, centred on the end", () => {
    expect(placeChip({ top: 100, bottom: 140, endX: 180 }, chip, vp)).toEqual({ left: 80, top: 140 + CHIP_GAP, flipped: false });
  });

  it("stays the edge inside the left and the right of the viewport", () => {
    expect(placeChip({ top: 100, bottom: 140, endX: 10 }, chip, vp).left).toBe(CHIP_EDGE);
    expect(placeChip({ top: 100, bottom: 140, endX: 355 }, chip, vp).left).toBe(360 - CHIP_EDGE - 200);
  });

  it("follows the scroll offset: document coordinates in and out", () => {
    const scrolled = { ...vp, scrollY: 1000 };
    expect(placeChip({ top: 1100, bottom: 1140, endX: 180 }, chip, scrolled)).toEqual({ left: 80, top: 1140 + CHIP_GAP, flipped: false });
  });

  it("flips above the first line when below would end past the viewport bottom", () => {
    // Below would end at 740 + 28 + 48 = 816 > 800 - 16.
    const p = placeChip({ top: 700, bottom: 740, endX: 180 }, chip, vp);
    expect(p).toEqual({ left: 80, top: 700 - CHIP_GAP - 48, flipped: true });
  });

  it("does not flip when below ends exactly at the edge", () => {
    // 708 + 28 + 48 = 784 = 800 - 16.
    expect(placeChip({ top: 680, bottom: 708, endX: 180 }, chip, vp).flipped).toBe(false);
  });

  it("flipped, it stays the edge under the viewport top", () => {
    const tall = { ...vp, height: 100 };
    expect(placeChip({ top: 20, bottom: 80, endX: 180 }, chip, tall)).toEqual({ left: 80, top: CHIP_EDGE, flipped: true });
  });
});
