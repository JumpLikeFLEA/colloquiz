// Browser-only canvas work for cropping a course cover to 16:9. Split out
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

import { coverOutputSize } from "./courseCover";

export function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode image."));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function renderCover(
  image: HTMLImageElement,
  crop: { x: number; y: number; width: number; height: number },
): Promise<File> {
  const { width, height } = coverOutputSize(crop);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get a 2D canvas context.");
  ctx.imageSmoothingQuality = "high";
  // JPEG has no alpha channel, so an unfilled canvas would composite a
  // transparent source (a PNG author image with a transparent background)
  // onto black. Fill white first so that source exports the way it looks.
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);

  const jpegBlob = await canvasToBlob(canvas, "image/jpeg", 0.85);
  if (!jpegBlob) throw new Error("Could not encode the cropped cover image.");
  return new File([jpegBlob], "cover.jpg", { type: "image/jpeg" });
}
