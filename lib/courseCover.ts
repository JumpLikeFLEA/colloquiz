// Course-cover limits and sizing math. Pure and dependency-free, modelled on
// lib/lessonImages.ts, but for the one cover image a course carries rather
// than an unbounded set of lesson images.
//
// COVER_MAX_OUTPUT_WIDTH (1920) is derived, not chosen: the course page's
// cover renders at up to 1024px CSS width (`sizes="(min-width: 1024px)
// 1024px, 100vw"`, app/(english)/courses/[courseSlug]/page.tsx:64) inside the
// lesson player's `lg:max-w-5xl` column (app/components/lesson-player/
// columnLayout.ts's LESSON_COLUMN_CLASS) — at device-pixel-ratio 2 that's
// ~2048px of real pixels, so a ~2000px master is what a DPR-2 screen actually
// requests. next/image then serves smaller variants from this one master for
// every narrower viewport; there is no reason to keep a master wider than the
// widest real request.
//
// COVER_SOURCE_MAX_BYTES (20 MB) is the SOURCE upload cap, well above
// LESSON_IMAGE_MAX_BYTES (5 MB, lib/lessonImages.ts) on purpose: that limit
// bounds what reaches the bucket, but a cover source file is cropped and
// re-encoded client-side before upload, so only the (much smaller) output
// counts against the bucket's cap — the source itself never lands in
// storage.

import { LESSON_IMAGE_MIME_TYPES } from "./lessonImages";

/** Fixed output aspect ratio: width / height. */
export const COVER_ASPECT = 16 / 9;

/** See header comment: derived from the course page's rendered width. */
export const COVER_MAX_OUTPUT_WIDTH = 1920;

/**
 * Quality bands on OUTPUT width (after coverOutputSize, not the crop).
 * softBelow and phoneOkBelow are derived from the two places a cover
 * actually renders, not chosen freehand:
 *   - CourseCard.tsx's `sizes` (`(min-width: 1024px) 33vw, (min-width: 640px)
 *     50vw, 100vw`) puts a phone below the 640px breakpoint at 100vw of a
 *     ~360-430 CSS px viewport; at device-pixel-ratio 2 that is the request
 *     softBelow guards against being softer than.
 *   - The course page (app/(english)/courses/[courseSlug]/page.tsx's
 *     `sizes="(min-width: 1024px) 1024px, 100vw"`) requests 1024 CSS px at
 *     that breakpoint, which at DPR 2 is what phoneOkBelow falls short of and
 *     COVER_MAX_OUTPUT_WIDTH (1920) is sized to cover.
 */
export const COVER_QUALITY_THRESHOLDS = {
  blockBelow: 480,
  softBelow: 800,
  phoneOkBelow: 1600,
};

/** 20 MB. See header comment: a source cap, not a bucket cap. */
export const COVER_SOURCE_MAX_BYTES = 20 * 1024 * 1024;

export const COVER_SOURCE_MAX_LABEL = "20 MB";
export const COVER_TYPES_LABEL = "PNG, JPEG or WebP";

/** Stated in the UI next to the button, BEFORE the user picks a file. */
export const COVER_LIMITS_HINT = `${COVER_TYPES_LABEL}, up to ${COVER_SOURCE_MAX_LABEL} · framed to 16:9`;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}

/**
 * Returns a human-readable reason the file is unusable, or null if it is fine.
 */
export function validateCoverSource(file: { type: string; size: number }): string | null {
  if (!(LESSON_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
    return `That file is ${file.type || "an unrecognised type"}. Course covers must be ${COVER_TYPES_LABEL}.`;
  }
  if (file.size > COVER_SOURCE_MAX_BYTES) {
    const shown = formatBytes(file.size);
    const size = shown === COVER_SOURCE_MAX_LABEL ? `${file.size.toLocaleString()} bytes` : shown;
    return `That file is ${size}. The limit is ${COVER_SOURCE_MAX_LABEL}.`;
  }
  if (file.size === 0) {
    return "That file is empty.";
  }
  return null;
}

/**
 * The output size for a given 16:9 crop: capped at COVER_MAX_OUTPUT_WIDTH,
 * never upscaled beyond the crop itself.
 */
export function coverOutputSize(crop: { width: number; height: number }): {
  width: number;
  height: number;
} {
  const width = Math.min(Math.round(crop.width), COVER_MAX_OUTPUT_WIDTH);
  const height = Math.round(width / COVER_ASPECT);
  return { width, height };
}

/**
 * How much headroom the OUTPUT (post coverOutputSize) has before it looks
 * soft on the render sites documented at COVER_QUALITY_THRESHOLDS.
 */
export function coverQuality(outputWidth: number): "too_small" | "soft" | "phone_ok" | "ok" {
  if (outputWidth < COVER_QUALITY_THRESHOLDS.blockBelow) return "too_small";
  if (outputWidth < COVER_QUALITY_THRESHOLDS.softBelow) return "soft";
  if (outputWidth < COVER_QUALITY_THRESHOLDS.phoneOkBelow) return "phone_ok";
  return "ok";
}

/**
 * The react-easy-crop zoom at which the whole image fits inside the 16:9
 * frame (letterboxed/pillarboxed, not filled). Exactly 1 for a 16:9 image;
 * below 1 for anything more square or more panoramic, since fitting a
 * non-16:9 image inside the frame always means shrinking it below "fills the
 * frame" scale on one axis.
 */
export function coverFitZoom(natural: { width: number; height: number }): number {
  const r = natural.width / natural.height / COVER_ASPECT;
  return Math.min(r, 1 / r);
}

/**
 * How a crop (react-easy-crop's croppedAreaPixels, in source px, which may
 * extend outside the image when zoomed below fill-frame scale) maps onto the
 * output canvas: the source region actually covered by the image, and where
 * that region lands in output px. `needsFill` is true whenever the crop
 * extends past the image bounds on any side, meaning the rest of the output
 * canvas needs the blurred-fill background rather than image pixels.
 */
export function coverDrawPlan(
  crop: { x: number; y: number; width: number; height: number },
  natural: { width: number; height: number },
): {
  output: { width: number; height: number };
  source: { x: number; y: number; width: number; height: number } | null;
  dest: { x: number; y: number; width: number; height: number } | null;
  needsFill: boolean;
} {
  const output = coverOutputSize(crop);
  const scale = output.width / crop.width;

  const left = Math.max(crop.x, 0);
  const top = Math.max(crop.y, 0);
  const right = Math.min(crop.x + crop.width, natural.width);
  const bottom = Math.min(crop.y + crop.height, natural.height);
  const width = right - left;
  const height = bottom - top;
  const hasIntersection = width > 0 && height > 0;

  const source = hasIntersection ? { x: left, y: top, width, height } : null;
  const dest = hasIntersection
    ? {
        x: (left - crop.x) * scale,
        y: (top - crop.y) * scale,
        width: width * scale,
        height: height * scale,
      }
    : null;

  const needsFill =
    crop.x < 0 || crop.y < 0 || crop.x + crop.width > natural.width || crop.y + crop.height > natural.height;

  return { output, source, dest, needsFill };
}

/**
 * Whether Satori (next/og's ImageResponse renderer, used by OgImageCard) can
 * decode this URL as the share-image background. Satori has no WebP
 * decoder — see lib/courseCoverCanvas.ts's header comment for the "Can't
 * load image ...: Unsupported image type: image/webp" / 500 this caused
 * before covers were switched to JPEG-only output. A pre-existing cover
 * uploaded before that switch, or any other non-PNG/JPEG URL, must still be
 * treated as undecodable rather than assumed fixed by the switch.
 */
export function isOgDecodableCoverUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const path = url.split("?")[0].toLowerCase();
  return path.endsWith(".png") || path.endsWith(".jpg") || path.endsWith(".jpeg");
}
