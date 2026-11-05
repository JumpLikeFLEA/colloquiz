"use client";

import { useRef } from "react";
import { Loader2, Upload } from "lucide-react";
import { LESSON_IMAGE_ACCEPT, LESSON_IMAGE_LIMITS_HINT } from "@/lib/lessonImages";
import { useLessonImageUpload, type UploadedImageSize } from "./useLessonImageUpload";

// AUTH-004 — the upload half of "the avatar-upload precedent," reused by both
// the theory image block (BlockForm.tsx) and the image-matching element
// editor (PracticeItemForm.tsx). Limits are stated (LESSON_IMAGE_LIMITS_HINT)
// BEFORE the file picker opens, checked again client-side before the upload
// starts, and enforced a third time by the bucket itself (migration 041) —
// this component only ever sees the first two.
//
// `onUpload` does the actual upload + old-object bookkeeping; this component
// owns only the picker UI. Its busy/error state is useLessonImageUpload's,
// shared with the image form's paste box (docs/decisions/0218).
//
// `kind` (INFRA-002) tells the shared uploadLessonImage in
// LessonContentEditor.tsx which max width to resize to before upload — a
// theory image and a matching element's image render at very different
// sizes (see lib/lessonImages.ts's LESSON_IMAGE_MAX_WIDTH_* comment), and
// this component is the leaf that knows which one it is.

export type LessonImageKind = "theory" | "matching";

/** `width`/`height` are the uploaded image's pixel size, when the upload
 * knows it (the resize does): the theory image block stores them
 * (docs/decisions/0218). */
export type UploadLessonImage = (
  file: File,
  previousUrl: string | undefined,
  kind: LessonImageKind,
) => Promise<{ url: string; width?: number; height?: number } | { error: string }>;

export function LessonImageUploadButton({
  currentUrl,
  kind,
  onUploaded,
  onUpload,
}: {
  currentUrl: string | undefined;
  kind: LessonImageKind;
  onUploaded: (url: string, size?: UploadedImageSize) => void;
  onUpload: UploadLessonImage;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { busy, error, handleFile } = useLessonImageUpload({ currentUrl, kind, onUploaded, onUpload });

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
