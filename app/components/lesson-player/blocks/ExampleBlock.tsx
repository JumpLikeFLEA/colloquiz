import type { z } from "zod";
import type { ExampleBlockSchema } from "@/lib/lessons";
import { InlineContentView } from "../InlineContent";

export function ExampleBlockView({ block }: { block: z.infer<typeof ExampleBlockSchema> }) {
  return (
    <div className="rounded-lg border border-border bg-muted px-3 py-2">
      <p className="text-xs font-medium text-muted-foreground mb-1">{block.label ?? "Example"}</p>
      <p className="text-sm text-foreground">
        <InlineContentView content={block.text} />
      </p>
    </div>
  );
}
