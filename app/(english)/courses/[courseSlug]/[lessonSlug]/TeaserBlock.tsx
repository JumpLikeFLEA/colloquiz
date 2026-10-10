import type { z } from "zod";
import { Play } from "lucide-react";
import type { TheoryBlock, VideoBlockSchema } from "@/lib/lessons";
// Direct paths, not the lesson-player barrel (docs/decisions/0059).
import { CalloutBlockView } from "@/app/components/lesson-player/blocks/CalloutBlock";
import { ExampleBlockView } from "@/app/components/lesson-player/blocks/ExampleBlock";
import { HeadingBlockView } from "@/app/components/lesson-player/blocks/HeadingBlock";
import { ImageBlockView } from "@/app/components/lesson-player/blocks/ImageBlock";
import { ListBlockView } from "@/app/components/lesson-player/blocks/ListBlock";
import { ProseBlockView } from "@/app/components/lesson-player/blocks/ProseBlock";
import { TableBlockView } from "@/app/components/lesson-player/blocks/TableBlock";
import { InlineContentView } from "@/app/components/lesson-player/InlineContent";
import { signInCopy } from "./signInCopy";

/**
 * ANON-011 — renders one teaser block on the sign-in screen with the
 * player's own block views, so the start of the lesson reads exactly as it
 * will after sign-in. A Server Component, and deliberately NOT
 * `TheoryBlockRenderer`: that dispatcher imports the two client blocks
 * (`VideoBlock`, `SelfCheckBlock`), and referencing a client component from
 * a Server Component on the lesson route makes it a new client entry, which
 * re-splits the route's chunks and grows every OPEN lesson's JS
 * (`VideoBlockView` alone: 258.6 → 258.9 KB in `npm run budget`;
 * docs/decisions/0104 Decision 2).
 *
 * So `video` is `TeaserVideo` below: the player's facade, server-rendered,
 * as a link that opens the video on YouTube in a new tab instead of loading
 * the embed in place (0104 Decision 2). `self_check` never reaches this
 * component (`lesson_teaser` cuts before it and `parseLessonTeaser` rejects
 * it). Exhaustive via `never`, like `TheoryBlockRenderer`, so a new block
 * type is a `tsc` error here too.
 */
export function TeaserBlock({ block }: { block: TheoryBlock }) {
  switch (block.type) {
    case "heading":
      return <HeadingBlockView block={block} />;
    case "prose":
      return <ProseBlockView block={block} />;
    case "example":
      return <ExampleBlockView block={block} />;
    case "callout":
      return <CalloutBlockView block={block} />;
    case "list":
      return <ListBlockView block={block} />;
    case "image":
      return <ImageBlockView block={block} />;
    case "table":
      return <TableBlockView block={block} />;
    case "video":
      return <TeaserVideo block={block} />;
    case "self_check":
      return null;
    default: {
      const exhaustive: never = block;
      throw new Error(`unhandled theory block type: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/**
 * `VideoBlockView`'s click-to-load facade with the same classes, as an
 * `<a>` instead of a stateful `<button>`, so it needs no client JS. Like the
 * facade, nothing third-party loads until the visitor taps.
 */
function TeaserVideo({ block }: { block: z.infer<typeof VideoBlockSchema> }) {
  return (
    <figure className="space-y-1">
      <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-muted">
        <a
          href={`https://www.youtube.com/watch?v=${block.youtubeId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-brand-text cursor-pointer"
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-brand text-primary-foreground">
            <Play className="size-6" fill="currentColor" aria-hidden="true" />
          </span>
          <span className="text-xs font-medium">{signInCopy.watchVideo}</span>
        </a>
      </div>
      {block.caption && (
        <figcaption className="text-xs text-muted-foreground">
          <InlineContentView content={block.caption} />
        </figcaption>
      )}
    </figure>
  );
}
