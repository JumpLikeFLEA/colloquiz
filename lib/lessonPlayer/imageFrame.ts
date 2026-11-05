import type { ImageSize } from "../lessons";

export type ImageFrame = { maxWidthClass: string; sizes: string };

/**
 * How wide a theory image shows, per its author-chosen size (docs/decisions/
 * 0218). Each size is a MAXIMUM width, so an image never runs past the
 * reading column: on a 360px phone (a 328px column) Medium, Large and full
 * width all fill the column and only Small stays narrower. Absent = the full
 * column, as every image showed before sizes existed.
 *
 * `sizes` tells next/image which source width to fetch; it follows the same
 * caps. Full literal class strings: Tailwind only sees complete class names
 * in source.
 */
const FRAMES: Record<ImageSize | "full", ImageFrame> = {
  small: { maxWidthClass: "max-w-64", sizes: "256px" },
  medium: { maxWidthClass: "max-w-96", sizes: "(min-width: 416px) 384px, 100vw" },
  large: { maxWidthClass: "max-w-lg", sizes: "(min-width: 544px) 512px, 100vw" },
  full: { maxWidthClass: "", sizes: "(min-width: 1024px) 672px, (min-width: 576px) 544px, 100vw" },
};

export function imageFrame(size: ImageSize | undefined): ImageFrame {
  return FRAMES[size ?? "full"];
}
