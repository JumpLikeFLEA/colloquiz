import type { z } from "zod";
import type { ProseBlockSchema } from "@/lib/lessons";
import { THEORY_BODY_TEXT_CLASS } from "../columnLayout";
import { InlineContentView } from "../InlineContent";

export function ProseBlockView({ block }: { block: z.infer<typeof ProseBlockSchema> }) {
  return (
    <p className={`leading-relaxed text-foreground ${THEORY_BODY_TEXT_CLASS}`}>
      <InlineContentView content={block.text} />
    </p>
  );
}
