import type { z } from "zod";
import type { HeadingBlockSchema } from "@/lib/lessons";
import { InlineContentView } from "../InlineContent";

export function HeadingBlockView({ block }: { block: z.infer<typeof HeadingBlockSchema> }) {
  const Tag = block.level === 1 ? "h2" : "h3";
  return (
    <Tag
      className={
        block.level === 1
          ? "text-lg font-semibold lg:text-center"
          : "text-base font-semibold lg:text-center"
      }
    >
      <InlineContentView content={block.text} />
    </Tag>
  );
}
