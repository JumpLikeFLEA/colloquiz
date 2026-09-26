"use client";

import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { LESSON_IMAGE_ACCEPT, LESSON_IMAGE_LIMITS_HINT, validateLessonImageFile } from "@/lib/lessonImages";

// AUTH-004 — the upload half of "the avatar-upload precedent," reused by both
// the theory image block (BlockForm.tsx) and the image-matching element
// editor (PracticeItemForm.tsx). Limits are stated (LESSON_IMAGE_LIMITS_HINT)
// BEFORE the file picker opens, checked again client-side before the upload
// starts, and enforced a third time by the bucket itself (migration 041) —
// this component only ever sees the first two.
//
// `onUpload` does the actual upload + old-object bookkeeping; this component
// owns only the picker UI and its busy/error state.

export type UploadLessonImage = (
  file: File,
  previousUrl: string | undefined,
) => Promise<{ url: string } | { error: string }>;

export function LessonImageUploadButton({
  currentUrl,
  onUploaded,
  onUpload,
}: {
  currentUrl: string | undefined;
  onUploaded: (url: string) => void;
  onUpload: UploadLessonImage;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    const reason = validateLessonImageFile(file);
    if (reason) {
      setError(reason);
      return;
    }
    setBusy(true);
    const result = await onUpload(file, currentUrl);
    setBusy(false);
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
          {busy ? "Uploading…" : "Upload image"}
        </button>
        <span className="text-xs text-muted-foreground">{LESSON_IMAGE_LIMITS_HINT}</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={LESSON_IMAGE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void handleFile(file);
        }}
      />
      {error && <p className="text-xs text-destructive-text">{error}</p>}
    </div>
  );
}
