import Image from "next/image";
import type { z } from "zod";
import type { ImageBlockSchema } from "@/lib/lessons";
import { imageFrame } from "@/lib/lessonPlayer/imageFrame";
import { InlineContentView } from "../InlineContent";

/**
 * docs/decisions/0218: the image shows at its own shape, with no box, band
 * or frame around it, at most as wide as its author-chosen size. Its pixel
 * size (stored by the editor) lets the browser reserve the right height
 * before it loads. A block saved before 0218 has none: 0 × 0 passes
 * next/image's check, and `h-auto` gives it its own shape once it loads.
 */
export function ImageBlockView({ block }: { block: z.infer<typeof ImageBlockSchema> }) {
  const frame = imageFrame(block.size);
  return (
    <figure className={`mx-auto w-full space-y-1 ${frame.maxWidthClass}`}>
      <Image
        src={block.url}
        alt={block.alt}
        width={block.width ?? 0}
        height={block.height ?? 0}
        sizes={frame.sizes}
        className="block h-auto w-full"
      />
      {block.caption && (
        <figcaption className="text-xs text-muted-foreground">
          <InlineContentView content={block.caption} />
        </figcaption>
      )}
    </figure>
  );
}
