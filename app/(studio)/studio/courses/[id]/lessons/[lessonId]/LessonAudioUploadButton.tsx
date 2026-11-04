"use client";

import { createContext, useContext, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { LESSON_AUDIO_ACCEPT, LESSON_AUDIO_LIMITS_HINT, validateLessonAudioFile } from "@/lib/lessonImages";

// The audio block's upload button (docs/decisions/0217), modelled on
// LessonImageUploadButton: limits stated before the picker opens, checked
// again before the upload, and enforced a third time by the bucket (migration
// 108). The upload itself comes from LessonContentEditor through context, so
// it isn't threaded through every row of BlockList (the BeforeListenForProvider
// precedent, VoiceTaskForm.tsx). Rendered without a provider, it refuses.

export type UploadLessonAudio = (file: File) => Promise<{ url: string } | { error: string }>;

const NO_UPLOAD: UploadLessonAudio = async () => ({ error: "Uploading audio isn't available here." });

const LessonAudioUploadContext = createContext<UploadLessonAudio>(NO_UPLOAD);
export const LessonAudioUploadProvider = LessonAudioUploadContext.Provider;

export function LessonAudioUploadButton({ onUploaded }: { onUploaded: (url: string) => void }) {
  const onUpload = useContext(LessonAudioUploadContext);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    const reason = validateLessonAudioFile(file);
    if (reason) {
      setError(reason);
      return;
    }
    setBusy(true);
    const result = await onUpload(file);
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onUploaded(result.url);
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-accent transition-colors"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          {busy ? "Uploading…" : "Upload audio"}
        </button>
        <span className="text-xs text-muted-foreground">{LESSON_AUDIO_LIMITS_HINT}</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={LESSON_AUDIO_ACCEPT}
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
