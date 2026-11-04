import type { z } from "zod";
import type { AudioBlockSchema } from "@/lib/lessons";
import { InlineContentView } from "../InlineContent";

/** A lesson's sound clip (docs/decisions/0217): the browser's own controls,
 * so no client state and no JS of its own. `preload="none"`: a lesson can hold
 * a clip per line, and a phone should fetch only the ones the learner plays. */
export function AudioBlockView({ block }: { block: z.infer<typeof AudioBlockSchema> }) {
  return (
    <figure className="space-y-1">
      <audio controls preload="none" src={block.url} className="w-full" />
      {block.caption && (
        <figcaption className="text-xs text-muted-foreground">
          <InlineContentView content={block.caption} />
        </figcaption>
      )}
    </figure>
  );
}
