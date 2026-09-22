import type { TheoryBlock } from "@/lib/lessons";
import { CalloutBlockView } from "./blocks/CalloutBlock";
import { ExampleBlockView } from "./blocks/ExampleBlock";
import { HeadingBlockView } from "./blocks/HeadingBlock";
import { ImageBlockView } from "./blocks/ImageBlock";
import { ListBlockView } from "./blocks/ListBlock";
import { ProseBlockView } from "./blocks/ProseBlock";
import { SelfCheckBlockView } from "./blocks/SelfCheckBlock";
import { TableBlockView } from "./blocks/TableBlock";
import { VideoBlockView } from "./blocks/VideoBlock";

/** Dispatches one theory block to its renderer by `type`. Exhaustive over
 * `TheoryBlockSchema`'s discriminated union — adding a block type without a
 * case here is a `tsc` error via the `never` fallback, not a silent blank. */
export function TheoryBlockRenderer({ block }: { block: TheoryBlock }) {
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
    case "video":
      return <VideoBlockView block={block} />;
    case "self_check":
      return <SelfCheckBlockView block={block} />;
    case "table":
      return <TableBlockView block={block} />;
    default: {
      const exhaustive: never = block;
      throw new Error(`unhandled theory block type: ${JSON.stringify(exhaustive)}`);
    }
  }
}
