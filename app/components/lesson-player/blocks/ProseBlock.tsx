import type { z } from "zod";
import type { ProseBlockSchema } from "@/lib/lessons";
import { InlineContentView } from "../InlineContent";

export function ProseBlockView({ block }: { block: z.infer<typeof ProseBlockSchema> }) {
  return (
    <p className="text-sm leading-relaxed text-foreground">
      <InlineContentView content={block.text} />
    </p>
  );
}
