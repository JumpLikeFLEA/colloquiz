"use client";

import { useEffect, useEffectEvent, type ClipboardEvent } from "react";
import Image from "next/image";
import { ClipboardPaste, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import type { ImageSize, TheoryBlock } from "@/lib/lessons";
import type { BlockFieldErrors } from "@/lib/lessonEditorErrors";
import { imageFrame } from "@/lib/lessonPlayer/imageFrame";
import { measureImage } from "@/lib/measureImage";
import { InlineField, TextField, labelClass } from "./BlockForm";
import { LessonImageUploadButton, type UploadLessonImage } from "./LessonImageUploadButton";
import { useLessonImageUpload, type UploadedImageSize } from "./useLessonImageUpload";

type ImageBlock = Extract<TheoryBlock, { type: "image" }>;

// docs/decisions/0218. The Select needs a value for "no size": full width is
// stored as an absent `size`, never as "full".
const SIZE_OPTIONS: { value: ImageSize | "full"; label: string }[] = [
  { value: "full", label: "Full width" },
  { value: "large", label: "Large" },
  { value: "medium", label: "Medium" },
  { value: "small", label: "Small" },
];

/** Wait this long after the URL field stops changing before loading it to
 * read its size, so typing a URL doesn't start a load per keystroke. */
const MEASURE_DELAY_MS = 300;

/**
 * The theory image block's form (docs/decisions/0218): the image as it will
 * show, a box that takes a pasted image, the Upload button, the size, then
 * URL, alt text and caption as before.
 *
 * The block stores the image's pixel size so the player can show it at its
 * own shape without a layout jump. An upload (picked or pasted) knows it
 * from the resize; a typed URL, or an image saved before 0218, is measured
 * here in the browser, which marks the lesson as changed until it is saved.
 */
export function ImageBlockForm({
  block,
  onChange,
  errors,
  onUploadImage,
}: {
  block: ImageBlock;
  onChange: (next: ImageBlock) => void;
  errors?: BlockFieldErrors;
  onUploadImage: UploadLessonImage;
}) {
  function applyUploaded(url: string, size?: UploadedImageSize) {
    onChange({ ...block, url, width: size?.width, height: size?.height });
  }

  const paste = useLessonImageUpload({
    currentUrl: block.url || undefined,
    kind: "theory",
    onUploaded: applyUploaded,
    onUpload: onUploadImage,
  });

  // Applies a measured size to the block as it is NOW (the author may have
  // typed in another field meanwhile), and only if the URL is still the one
  // that was measured.
  const applyMeasured = useEffectEvent((url: string, size: UploadedImageSize) => {
    if (block.url === url && block.width === undefined) {
      onChange({ ...block, width: size.width, height: size.height });
    }
  });

  const { url, width } = block;
  useEffect(() => {
    if (!url || width !== undefined) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void measureImage(url).then((size) => {
        if (!cancelled && size) applyMeasured(url, size);
      });
    }, MEASURE_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [url, width]);

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    // A field that handled the paste itself (the caption editor) wins.
    if (event.defaultPrevented) return;
    const file = Array.from(event.clipboardData.files).find((f) => f.type.startsWith("image/"));
    // No image on the clipboard: an ordinary text paste, e.g. a URL into
    // the URL field, goes through untouched.
    if (!file) return;
    event.preventDefault();
    void paste.handleFile(file);
  }

  const frame = imageFrame(block.size);

  return (
    <div className="space-y-3" onPaste={handlePaste}>
      <div className="space-y-1">
        <div
          tabIndex={0}
          role="group"
          aria-label="Image. Click here, then paste an image with Ctrl+V or ⌘V."
          className="rounded-xl border-2 border-dashed border-border p-3 outline-none transition-colors focus:border-brand"
        >
          {block.url ? (
            // The image as the learner sees it, at its size (the lesson's
            // `imageFrame`). `unoptimized`: a typed URL on another host
            // would make next/image's loader throw in development.
            <figure className={`mx-auto w-full ${frame.maxWidthClass}`}>
              <Image
                src={block.url}
                alt={block.alt}
                width={block.width ?? 0}
                height={block.height ?? 0}
                unoptimized
                className="block h-auto w-full"
              />
            </figure>
          ) : (
            <div className="flex min-h-28 flex-col items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
              <ClipboardPaste size={18} />
              <p>Click here, then press Ctrl+V (⌘V on a Mac) to paste an image.</p>
            </div>
          )}
        </div>
        {paste.busy ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 size={12} className="animate-spin" />
            Uploading the pasted image…
          </p>
        ) : block.url ? (
          <p className="text-xs text-muted-foreground">To replace it, upload another or click the image and paste one.</p>
        ) : null}
        {paste.error && <p className="text-xs text-destructive-text">{paste.error}</p>}
      </div>
      <LessonImageUploadButton
        currentUrl={block.url || undefined}
        kind="theory"
        onUploaded={applyUploaded}
        onUpload={onUploadImage}
      />
      <div className="space-y-1">
        <label className={labelClass}>Size</label>
        <Select
          value={block.size ?? "full"}
          onValueChange={(v) => onChange({ ...block, size: v === "full" ? undefined : (v as ImageSize) })}
        >
          <SelectTrigger className="w-40" aria-label="Size">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SIZE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Small, Medium and Large are maximum widths. On a phone an image never runs past the screen.
        </p>
      </div>
      <TextField
        label="Image URL"
        value={block.url}
        onChange={(next) => onChange({ ...block, url: next, width: undefined, height: undefined })}
        errors={errors}
        path="url"
        placeholder="https://… (or upload or paste above)"
      />
      <TextField
        label="Alt text"
        value={block.alt}
        onChange={(alt) => onChange({ ...block, alt })}
        errors={errors}
        path="alt"
        placeholder="Describes the image for a screen reader"
      />
      <InlineField
        label="Caption (optional)"
        value={block.caption ?? []}
        onChange={(caption) => onChange({ ...block, caption: caption.length > 0 ? caption : undefined })}
        errors={errors}
        path="caption"
      />
    </div>
  );
}
