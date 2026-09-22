import type { z } from "zod";
import type { ListBlockSchema } from "@/lib/lessons";
import { InlineContentView } from "../InlineContent";

export function ListBlockView({ block }: { block: z.infer<typeof ListBlockSchema> }) {
  const Tag = block.ordered ? "ol" : "ul";
  return (
    <Tag className={`text-sm text-foreground pl-5 space-y-1 ${block.ordered ? "list-decimal" : "list-disc"}`}>
      {block.items.map((item, index) => (
        // Authored list items carry no id of their own; `items` is re-derived
        // fresh on every parse, never reordered in place.
        <li key={index}>
          <InlineContentView content={item} />
        </li>
      ))}
    </Tag>
  );
}
