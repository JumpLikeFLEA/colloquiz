// Browser-only canvas resize + WebP encode, shared by the lesson-image and
// avatar upload paths (INFRA-002). Modelled on lib/courseCoverCanvas.ts's
// draw/encode split, but generic (no crop, no fixed aspect ratio) — covers
// keep their own JPEG-only pipeline (see that file's header comment: Satori
// can't decode WebP, so a cover's master must stay JPEG). Nothing here
// touches covers.
//
// No canvas/Image/Blob under jsdom, so this has no vitest coverage — verify
// by hand in a real browser, same as courseCoverCanvas.ts.

function loadImage(src: string): Promise<HTMLImageElement> {
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

export type ResizedImage = { file: File; width: number; height: number };

const WEBP_QUALITY = 0.85;
const JPEG_FALLBACK_QUALITY = 0.85;

/**
 * Resizes `source` so its width is at most `maxWidth` (never upscaled,
 * aspect ratio preserved) and re-encodes it as WebP. Some browsers'
 * `canvas.toBlob` silently ignores an unsupported requested type and returns
 * a different one (documented Safari behaviour) — the returned blob's own
 * `type` is checked, and a non-WebP result falls back to a JPEG encode
 * rather than uploading a file whose bytes don't match its extension.
 */
export async function resizeImageToWebp(source: File, maxWidth: number): Promise<ResizedImage> {
  const src = URL.createObjectURL(source);
  try {
    const image = await loadImage(src);
    const scale = Math.min(1, maxWidth / image.naturalWidth);
    const width = Math.round(image.naturalWidth * scale);
    const height = Math.round(image.naturalHeight * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get a 2D canvas context.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, width, height);

    let blob = await canvasToBlob(canvas, "image/webp", WEBP_QUALITY);
    let type = "image/webp";
    let name = "image.webp";
    if (!blob || blob.type !== "image/webp") {
      blob = await canvasToBlob(canvas, "image/jpeg", JPEG_FALLBACK_QUALITY);
      type = "image/jpeg";
      name = "image.jpg";
    }
    if (!blob) throw new Error("Could not encode the resized image.");

    return { file: new File([blob], name, { type }), width, height };
  } finally {
    URL.revokeObjectURL(src);
  }
}
