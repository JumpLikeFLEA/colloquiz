import Image from "next/image";
import type { MatchingContent } from "@/lib/items/matching";

/**
 * PLAY-003 — renders a matching element's `content` union (text or image;
 * `score` never reads it, see lib/items/matching.ts's header). Image sizing
 * mirrors ImageBlockView's `fill`-inside-fixed-box convention
 * (app/components/lesson-player/blocks/ImageBlock.tsx) since authored
 * content stores only a URL, never intrinsic dimensions — scaled down to a
 * chip-sized square here rather than the theory block's aspect-video.
 */
export function MatchingContentView({
  content,
  className,
  inline = false,
}: {
  content: MatchingContent;
  className?: string;
  inline?: boolean;
}) {
  if (content.kind === "text") {
    return <span className={className}>{content.text}</span>;
  }

  return (
    <span
      className={`relative ${inline ? "size-10" : "size-12"} shrink-0 overflow-hidden rounded-md border border-border bg-muted ${className ?? ""}`}
    >
      <Image src={content.src} alt={content.alt} fill className="object-cover" sizes="48px" />
    </span>
  );
}
