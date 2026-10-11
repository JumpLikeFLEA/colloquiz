"use client";

import { useRef, useState } from "react";

// A take's player in the review queue. The page signs a 15-minute URL under
// the editor's own session (0110 Decision 5); a queue left open past that
// fails to load, so the element asks the playback route for a fresh one —
// once per URL, so a take that fails for another reason can't loop. The
// same recovery as VOICE-005's learner player.
// No download control: 0109 Decision 13.

export function ReviewAudio({ submissionId, initialUrl }: { submissionId: string; initialUrl: string | null }) {
  const [url, setUrl] = useState(initialUrl);
  const refreshing = useRef(false);
  const failed = useRef(new Set<string>());

  function onError() {
    if (!url || failed.current.has(url)) return;
    failed.current.add(url);
    void refresh();
  }

  async function refresh() {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const res = await fetch(`/api/voice/submissions/${submissionId}/playback`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && typeof data.url === "string") setUrl(data.url);
    } finally {
      refreshing.current = false;
    }
  }

  if (!url) {
    return (
      <button
        type="button"
        onClick={refresh}
        className="cursor-pointer min-h-11 px-4 rounded-xl border border-border text-sm font-medium hover:bg-accent transition-colors"
      >
        Load recording
      </button>
    );
  }
  return (
    <audio
      controls
      controlsList="nodownload"
      preload="metadata"
      src={url}
      onError={onError}
      className="w-full"
    />
  );
}
