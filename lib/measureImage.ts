// Browser-only: an image's own pixel size, for a lesson image whose URL was
// typed rather than uploaded (an upload already knows its size from the
// resize, lib/imageResize.ts). Reading naturalWidth/naturalHeight needs no
// CORS, unlike drawing to a canvas. No Image under jsdom, so this has no
// vitest coverage: verified by hand in a real browser, like imageResize.ts.

export type MeasuredImage = { width: number; height: number };

/** Resolves to null when the URL does not load as an image. */
export function measureImage(url: string): Promise<MeasuredImage | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () =>
      resolve(image.naturalWidth > 0 && image.naturalHeight > 0 ? { width: image.naturalWidth, height: image.naturalHeight } : null);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}
