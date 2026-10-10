"use client";

import { useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Loader2 } from "lucide-react";
import { COVER_ASPECT, coverFitZoom, coverOutputSize, coverQuality } from "@/lib/courseCover";
import { drawCover, renderCover } from "@/lib/courseCoverCanvas";
import { Button } from "@/app/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { Slider } from "@/app/components/ui/slider";

// VIS-001 step 4b / VIS-002: the object URL for `src` and the decoded `image`
// are owned by CoverImagePicker (created in its file-input onChange, revoked
// in its cancel/confirm-settle handlers) — this component only ever renders
// what it's handed, never creates, decodes or revokes anything itself. See
// CoverImagePicker.tsx's header comment for why that ownership lives there.

/** CSS size of the catalogue-card preview; 16:9 like CourseCard's own cover. */
const PREVIEW_WIDTH = 320;
const PREVIEW_HEIGHT = Math.round(PREVIEW_WIDTH / COVER_ASPECT);

function previewBackingSize(): { width: number; height: number } {
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  return { width: Math.round(PREVIEW_WIDTH * dpr), height: Math.round(PREVIEW_HEIGHT * dpr) };
}

function qualityMessage(
  area: Area,
  zoom: number,
  fitZoom: number,
): { text: string; tone: "destructive" | "muted" } {
  const { width, height } = coverOutputSize(area);
  const band = coverQuality(width);
  if (band === "too_small") {
    const suffix = zoom > fitZoom ? " Zoom out" : " Pick a larger image.";
    return { text: `Too small to use as a cover (${width}px wide).${suffix}`, tone: "destructive" };
  }
  const base =
    band === "soft"
      ? "Will look soft, especially on large screens."
      : band === "phone_ok"
        ? "Sharp on phones; slightly soft on large desktop screens."
        : "Sharp on every screen.";
  return { text: `${base} Saved at ${width}×${height}px.`, tone: "muted" };
}

/**
 * The cropper + zoom slider + preview + quality message, for one picked
 * image. Keyed by that file's identity in the parent (CoverCropDialog) so a
 * NEW file remounts this component instead of an effect resetting crop/zoom
 * state — resetting state in response to a changed prop by calling setState
 * from an effect is exactly the cascading-render pattern
 * react-hooks/set-state-in-effect warns against; a remount gets a fresh
 * initial state for free. `image` arrives as a prop (already decoded by
 * CoverImagePicker), so fitZoom is known at mount and needs no effect either.
 */
function CropperPane({
  src,
  image,
  onCropComplete,
}: {
  src: string;
  image: HTMLImageElement;
  onCropComplete: (areaPixels: Area) => void;
}) {
  const fitZoom = coverFitZoom({ width: image.naturalWidth, height: image.naturalHeight });
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);

  function handleCropComplete(_area: Area, areaPixels: Area) {
    setCroppedAreaPixels(areaPixels);
    onCropComplete(areaPixels);
    const canvas = previewRef.current;
    if (canvas) drawCover(canvas, image, areaPixels, previewBackingSize());
  }

  const message = croppedAreaPixels ? qualityMessage(croppedAreaPixels, zoom, fitZoom) : null;

  return (
    <>
      <div className="relative h-72 sm:h-96 bg-muted rounded-lg overflow-hidden">
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          minZoom={fitZoom}
          maxZoom={4}
          restrictPosition={zoom >= 1}
          aspect={COVER_ASPECT}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={handleCropComplete}
        />
      </div>

      {fitZoom < 1 && (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setZoom(fitZoom);
              setCrop({ x: 0, y: 0 });
            }}
          >
            Fit whole image
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setZoom(1);
              setCrop({ x: 0, y: 0 });
            }}
          >
            Fill frame
          </Button>
        </div>
      )}

      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground shrink-0">Zoom</span>
        <Slider
          min={fitZoom}
          max={4}
          step={0.01}
          value={[zoom]}
          onValueChange={([value]: number[]) => setZoom(value)}
        />
      </div>

      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Catalogue card preview</p>
        <canvas
          ref={previewRef}
          aria-label="Catalogue card preview"
          className="rounded-xl bg-muted"
          style={{ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT }}
        />
      </div>

      {message && (
        <p className={`text-sm ${message.tone === "destructive" ? "text-destructive-text" : "text-muted-foreground"}`}>
          {message.text}
        </p>
      )}
    </>
  );
}

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export function CoverCropDialog({
  file,
  src,
  image,
  onCancel,
  onConfirm,
}: {
  file: File | null;
  src: string | null;
  image: HTMLImageElement | null;
  onCancel: () => void;
  onConfirm: (cropped: File) => void | Promise<void>;
}) {
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Adjusting state during render in response to a changed prop (React's own
  // pattern for this, not an effect) — a new file must not leave Confirm
  // briefly enabled against the PREVIOUS file's croppedAreaPixels before
  // CropperPane's own onCropComplete has fired for the new one.
  const [syncedFile, setSyncedFile] = useState(file);
  if (file !== syncedFile) {
    setSyncedFile(file);
    setCroppedAreaPixels(null);
    setError(null);
  }

  const quality = croppedAreaPixels ? coverQuality(coverOutputSize(croppedAreaPixels).width) : null;

  async function handleConfirm() {
    if (!image || !croppedAreaPixels) return;
    setBusy(true);
    setError(null);
    try {
      const cropped = await renderCover(image, croppedAreaPixels);
      await onConfirm(cropped);
    } catch {
      setError("Could not process that image. Try a different file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={file !== null} onOpenChange={(open: boolean) => !open && onCancel()}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Frame cover image</DialogTitle>
        </DialogHeader>

        {file && src && image && (
          <CropperPane
            key={fileKey(file)}
            src={src}
            image={image}
            onCropComplete={(areaPixels) => {
              setCroppedAreaPixels(areaPixels);
              setError(null);
            }}
          />
        )}

        {error && <p className="text-sm text-destructive-text">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={busy || quality === "too_small" || !croppedAreaPixels}>
            {busy && <Loader2 className="animate-spin" size={16} />}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
