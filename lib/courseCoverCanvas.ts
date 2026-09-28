// Browser-only canvas work for rendering a course cover to 16:9. Split out
// from lib/courseCover.ts (pure sizing math) because this module touches
// Image/canvas/Blob, none of which exist under jsdom — there is no vitest
// for this file, and none should be added by polyfilling canvas; verify it
// by hand in a real browser instead (see step 4).
//
// Output is JPEG ONLY (VIS-001 step 4c). This used to try WebP first: that
// broke the per-course share image outright — `OgImageCard`'s <img> is
// rendered by Satori (next/og's ImageResponse renderer), which cannot decode
// WebP at all ("Can't load image ...: Unsupported image type: image/webp",
// then `Error: failed to pipe response` / 500 on the actual GET; a HEAD
// request looked fine, which is why this went unnoticed until a real GET was
// driven — see docs/decisions for the write-up). JPEG has no such gap.
// Learners are unaffected: next.config.ts sets no `images.formats` override,
// so next/image keeps negotiating its own default (WebP) to browsers on
// every OTHER render of this same source file — only the master stored in
// the bucket changed format, not what a learner's browser downloads.
//
// The crop rect is in the image's NATURAL (EXIF-oriented) pixel space —
// react-easy-crop's `croppedAreaPixels` reports coordinates in that same
// space, so no conversion happens here. This assumes the browser's default
// `image-orientation: from-image` has already rotated the decoded
// HTMLImageElement to match what the user sees (i.e. `image.naturalWidth`/
// `naturalHeight` are post-rotation). That assumption is unverified against
// a real portrait phone photo until step 4's manual check; if it turns out
// wrong, the fix is reading the EXIF orientation tag before cropping, not a
// speculative parser added now.
//
// VIS-002: fit mode lets the crop rect extend outside the image (zoom below
// fill-frame scale — see coverFitZoom), so drawCover fills whatever area the
// image doesn't cover with a blurred, darkened copy of the whole image
// (coverDrawPlan's `needsFill`) rather than leaving canvas white/transparent
// there. The blur is NOT `ctx.filter = "blur(...)"` — Safari's canvas filter
// support is uneven enough that this repo doesn't rely on it. Instead the
// whole image is drawn into a small (~32px-wide) offscreen canvas and that
// canvas is stretched back up to full frame size: shrinking to a handful of
// pixels and then magnifying them is itself a (crude, cheap, universally
// supported) blur. drawCover is the ONE drawing routine, used for both the
// upload (renderCover, at full coverOutputSize) and the live dialog preview
// (at preview size) via the same size-relative scaling of coverDrawPlan's
// output — so the preview can never drift from what actually gets uploaded.

import { coverDrawPlan, coverOutputSize } from "./courseCover";

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode image."));
    image.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Width of the offscreen canvas used to produce the blurred fill backdrop. */
const BLUR_DOWNSCALE_WIDTH = 32;

function drawBlurredFill(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  size: { width: number; height: number },
): void {
  const blurHeight = Math.max(1, Math.round(BLUR_DOWNSCALE_WIDTH / (size.width / size.height)));

  const small = document.createElement("canvas");
  small.width = BLUR_DOWNSCALE_WIDTH;
  small.height = blurHeight;
  const smallCtx = small.getContext("2d");
  if (!smallCtx) throw new Error("Could not get a 2D canvas context.");

  // object-cover the whole image into the small frame, same idea as
  // coverDrawPlan but against the image's own aspect ratio rather than a crop.
  const imageAspect = image.naturalWidth / image.naturalHeight;
  const frameAspect = BLUR_DOWNSCALE_WIDTH / blurHeight;
  let sx: number, sy: number, sw: number, sh: number;
  if (imageAspect > frameAspect) {
    sh = image.naturalHeight;
    sw = sh * frameAspect;
    sx = (image.naturalWidth - sw) / 2;
    sy = 0;
  } else {
    sw = image.naturalWidth;
    sh = sw / frameAspect;
    sx = 0;
    sy = (image.naturalHeight - sh) / 2;
  }
  smallCtx.drawImage(image, sx, sy, sw, sh, 0, 0, BLUR_DOWNSCALE_WIDTH, blurHeight);

  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(small, 0, 0, BLUR_DOWNSCALE_WIDTH, blurHeight, 0, 0, size.width, size.height);
  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  ctx.fillRect(0, 0, size.width, size.height);
}

/**
 * The one drawing routine. Draws `image`, cropped per `crop` (in the image's
 * natural px space, may extend outside the image bounds in fit mode), into
 * `canvas` at `size` — `size` need not equal coverOutputSize(crop): the
 * dialog's live preview draws at a smaller size than the eventual upload, and
 * both go through this same function so the preview can't drift from it.
 */
export function drawCover(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  crop: { x: number; y: number; width: number; height: number },
  size: { width: number; height: number },
): void {
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get a 2D canvas context.");
  ctx.imageSmoothingQuality = "high";

  // JPEG has no alpha channel, so an unfilled canvas would composite a
  // transparent source (a PNG author image with a transparent background)
  // onto black. Fill white first so that source exports the way it looks.
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, size.width, size.height);

  const plan = coverDrawPlan(crop, { width: image.naturalWidth, height: image.naturalHeight });
  const drawScale = size.width / plan.output.width;

  if (plan.needsFill) {
    drawBlurredFill(ctx, image, size);
  }

  if (plan.source && plan.dest) {
    ctx.drawImage(
      image,
      plan.source.x,
      plan.source.y,
      plan.source.width,
      plan.source.height,
      plan.dest.x * drawScale,
      plan.dest.y * drawScale,
      plan.dest.width * drawScale,
      plan.dest.height * drawScale,
    );
  }
}

export async function renderCover(
  image: HTMLImageElement,
  crop: { x: number; y: number; width: number; height: number },
): Promise<File> {
  const size = coverOutputSize(crop);
  const canvas = document.createElement("canvas");
  drawCover(canvas, image, crop, size);

  const jpegBlob = await canvasToBlob(canvas, "image/jpeg", 0.85);
  if (!jpegBlob) throw new Error("Could not encode the cropped cover image.");
  return new File([jpegBlob], "cover.jpg", { type: "image/jpeg" });
}
