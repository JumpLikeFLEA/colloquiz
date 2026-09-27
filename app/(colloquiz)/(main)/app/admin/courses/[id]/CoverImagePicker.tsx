"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2, Upload } from "lucide-react";
import { LESSON_IMAGE_ACCEPT } from "@/lib/lessonImages";
import { COVER_LIMITS_HINT, validateCoverSource } from "@/lib/courseCover";
import type { UploadLessonImage } from "./lessons/[lessonId]/LessonImageUploadButton";

// VIS-001 step 4: the cover-specific replacement for LessonImageUploadButton.
// Same props/onUpload contract (courseCoverCanvas's renderCover produces a
// File the existing uploadCover in CourseDetailView.tsx uploads unchanged),
// but the picked file is cropped to 16:9 before it ever reaches onUpload.
// react-easy-crop (CoverCropDialog) is fetched only once a file is picked,
// not on this component's own load — { ssr: false } because the cropper
// touches the DOM/canvas directly.
const CoverCropDialog = dynamic(() => import("./CoverCropDialog").then((m) => m.CoverCropDialog), {
  ssr: false,
});

// The object URL is a real external resource (the browser's blob registry),
// so THIS component — the one long-lived owner of "the currently picked
// file" — creates and revokes it, not an effect inside the dialog. Step 4b:
// a useMemo(createObjectURL) + a revoke-only cleanup effect inside
// CoverCropDialog got the revoke called by React 19 Strict Mode's dev-only
// double-invoke before the real mount's <img> ever loaded it
// (net::ERR_FILE_NOT_FOUND, naturalWidth 0 — caught only in a real browser).
// Creating the URL here, in a plain event handler, has no effect-timing
// hazard at all: there is no double-invoke of onChange.
type PendingCover = { file: File; src: string };

export function CoverImagePicker({
  currentUrl,
  onUploaded,
  onUpload,
}: {
  currentUrl: string | undefined;
  onUploaded: (url: string) => void;
  onUpload: UploadLessonImage;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingCover | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handlePick(file: File) {
    setError(null);
    const reason = validateCoverSource(file);
    if (reason) {
      setError(reason);
      return;
    }
    setPending({ file, src: URL.createObjectURL(file) });
  }

  function handleCancel() {
    if (pending) URL.revokeObjectURL(pending.src);
    setPending(null);
  }

  async function handleConfirm(cropped: File) {
    setBusy(true);
    const result = await onUpload(cropped, currentUrl);
    setBusy(false);
    // The dialog closes here either way — on success as much as on error —
    // so the object URL is revoked in this one place regardless of outcome,
    // and an upload error is visible (it was previously rendered behind the
    // still-open dialog's overlay, where nobody could see it).
    if (pending) URL.revokeObjectURL(pending.src);
    setPending(null);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onUploaded(result.url);
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-accent transition-colors"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          {busy ? "Uploading…" : "Upload cover"}
        </button>
        <span className="text-xs text-muted-foreground">{COVER_LIMITS_HINT}</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={LESSON_IMAGE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) handlePick(file);
        }}
      />
      {error && <p className="text-xs text-destructive-text">{error}</p>}
      <CoverCropDialog
        file={pending?.file ?? null}
        src={pending?.src ?? null}
        onCancel={handleCancel}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
