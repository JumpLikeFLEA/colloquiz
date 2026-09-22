"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import type { z } from "zod";
import type { VideoBlockSchema } from "@/lib/lessons";
import { buildYouTubeEmbedUrl } from "@/lib/lessonPlayer/session";
import { InlineContentView } from "../InlineContent";

/**
 * Click-to-load facade (PLAY-001 acceptance): no iframe — and so no
 * third-party request or cookie — exists in the DOM until the learner
 * explicitly opts in by clicking. Video is decorative in v1 (docs/handoff.md);
 * a learner who never clicks still sees the caption and completes the lesson.
 */
export function VideoBlockView({ block }: { block: z.infer<typeof VideoBlockSchema> }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <figure className="space-y-1">
      <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-muted">
        {loaded ? (
          <iframe
            src={buildYouTubeEmbedUrl(block.youtubeId)}
            title="Lesson video"
            className="absolute inset-0 size-full"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            onClick={() => setLoaded(true)}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-brand-text cursor-pointer"
            aria-label="Play video"
          >
            <span className="flex size-12 items-center justify-center rounded-full bg-brand text-primary-foreground">
              <Play className="size-6" fill="currentColor" aria-hidden="true" />
            </span>
            <span className="text-xs font-medium">Click to play video</span>
          </button>
        )}
      </div>
      {block.caption && (
        <figcaption className="text-xs text-muted-foreground">
          <InlineContentView content={block.caption} />
        </figcaption>
      )}
    </figure>
  );
}
