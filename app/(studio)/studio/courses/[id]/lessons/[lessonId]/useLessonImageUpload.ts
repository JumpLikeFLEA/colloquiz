"use client";

import { useState } from "react";
import { validateLessonImageFile } from "@/lib/lessonImages";
import type { LessonImageKind, UploadLessonImage } from "./LessonImageUploadButton";

export type UploadedImageSize = { width: number; height: number };

/**
 * The busy / error state and the checks around one lesson-image upload,
 * shared by the Upload button and the image form's paste box
 * (docs/decisions/0218), so a pasted image takes exactly the path a picked
 * one does: the client-side limits, then `onUpload` (resize, bucket,
 * replaced-object bookkeeping).
 *
 * `onUploaded` gets the image's pixel size when the upload knows it, and is
 * called with the URL alone otherwise.
 */
export function useLessonImageUpload({
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
    const result = await onUpload(file, currentUrl, kind);
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    if (result.width !== undefined && result.height !== undefined) {
      onUploaded(result.url, { width: result.width, height: result.height });
    } else {
      onUploaded(result.url);
    }
  }

  return { busy, error, handleFile };
}
