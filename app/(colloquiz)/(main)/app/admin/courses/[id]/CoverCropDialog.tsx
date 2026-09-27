"use client";

import { useMemo, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Loader2 } from "lucide-react";
import {
  COVER_ASPECT,
  COVER_MIN_CROP,
  coverCropQuality,
  coverOutputSize,
} from "@/lib/courseCover";
import { loadImage, renderCover } from "@/lib/courseCoverCanvas";
import { Button } from "@/app/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { Slider } from "@/app/components/ui/slider";

// VIS-001 step 4b: the object URL for `src` is owned by CoverImagePicker
// (created in its file-input onChange, revoked in its cancel/confirm-settle
// handlers) — this component only ever renders a URL it's handed, never
// creates or revokes one itself. See CoverImagePicker.tsx's header comment
// for why that ownership moved out of here.

/**
 * The cropper + zoom slider + quality message, for one picked file. Keyed by
 * that file's identity in the parent (CoverCropDialog) so a NEW file remounts
 * this component instead of an effect resetting crop/zoom state — resetting
 * state in response to a changed prop by calling setState from an effect is
 * exactly the cascading-render pattern react-hooks/set-state-in-effect warns
 * against; a remount gets a fresh initial state for free.
 */
function CropperPane({
  src,
  onCropComplete,
}: {
  src: string;
  onCropComplete: (areaPixels: Area) => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const quality = useMemo(
    () => (croppedAreaPixels ? coverCropQuality(croppedAreaPixels) : null),
    [croppedAreaPixels],
  );

  return (
    <>
      <div className="relative h-72 sm:h-96 bg-muted rounded-lg overflow-hidden">
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          aspect={COVER_ASPECT}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={(_area, areaPixels) => {
            setCroppedAreaPixels(areaPixels);
            onCropComplete(areaPixels);
          }}
        />
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground shrink-0">Zoom</span>
        <Slider
          min={1}
          max={4}
          step={0.1}
          value={[zoom]}
          onValueChange={([value]: number[]) => setZoom(value)}
        />
      </div>

      {quality === "too_small" && croppedAreaPixels && (
        <p className="text-sm text-destructive-text">
          This crop is {Math.round(croppedAreaPixels.width)}×{Math.round(croppedAreaPixels.height)}px. The
          minimum is {COVER_MIN_CROP.width}×{COVER_MIN_CROP.height}px — zoom out or pick a larger image.
        </p>
      )}
      {quality === "low" && (
        <p className="text-sm text-muted-foreground">This crop may look soft on large screens.</p>
      )}
      {quality === "ok" && croppedAreaPixels && (
        <p className="text-sm text-muted-foreground">
          {(() => {
            const { width, height } = coverOutputSize(croppedAreaPixels);
            return `Will be saved at ${width}×${height}px.`;
          })()}
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
  onCancel,
  onConfirm,
}: {
  file: File | null;
  src: string | null;
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

  const quality = croppedAreaPixels ? coverCropQuality(croppedAreaPixels) : null;

  async function handleConfirm() {
    if (!file || !croppedAreaPixels) return;
    setBusy(true);
    setError(null);
    try {
      const image = await loadImage(file);
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
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Crop cover image</DialogTitle>
        </DialogHeader>

        {file && src && (
          <CropperPane
            key={fileKey(file)}
            src={src}
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
