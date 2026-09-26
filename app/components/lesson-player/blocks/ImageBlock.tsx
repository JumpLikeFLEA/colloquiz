import Image from "next/image";
import type { z } from "zod";
import type { ImageBlockSchema } from "@/lib/lessons";
import { InlineContentView } from "../InlineContent";

export function ImageBlockView({ block }: { block: z.infer<typeof ImageBlockSchema> }) {
  return (
    <figure className="space-y-1">
      <div className="relative w-full overflow-hidden rounded-lg border border-border bg-muted">
        {/* Intrinsic size is unknown at authoring time (only a public URL is
         * stored — see theoryBlocks.ts), so `fill` inside a fixed-aspect box
         * rather than requiring authored width/height. */}
        <div className="aspect-video relative">
          <Image src={block.url} alt={block.alt} fill className="object-contain" sizes="(max-width: 1024px) 100vw, 1024px" />
        </div>
      </div>
      {block.caption && (
        <figcaption className="text-xs text-muted-foreground">
          <InlineContentView content={block.caption} />
        </figcaption>
      )}
    </figure>
  );
}
