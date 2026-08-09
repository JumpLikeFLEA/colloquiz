import { RichText } from "@/app/components/RichText";
import { CALLOUT_TONE } from "@/lib/calloutTone";
import type { TheoryBlock } from "@/lib/courseContent";

/**
 * Renders a stage's theory blocks.
 *
 * A SERVER component on purpose: it uses RichText, which pulls in KaTeX. Keeping
 * it server-side renders the math to inert HTML there and keeps ~80 KB of KaTeX
 * JS out of the client bundle — the stage page passes this element into the
 * client StageView as a prop (the "server component as a child of a client
 * component" pattern), so StageView itself never imports katex.
 *
 * Theory has NO inline formatting (see lib/courseContent): every author string is
 * a RichText node (plain text + `\(…\)` / `\[…\]` math), and structure comes from
 * the block type, never from markdown inside a string.
 */
export function TheorySection({ blocks }: { blocks: TheoryBlock[] }) {
  if (blocks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No theory has been written for this stage yet.</p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </div>
  );
}

function Block({ block }: { block: TheoryBlock }) {
  switch (block.type) {
    case "prose":
      // <div>, not <p>: RichText now emits one <p> per paragraph, and <p>
      // cannot nest <p>. Classes unchanged.
      return (
        <div className="text-foreground leading-relaxed">
          <RichText text={block.body} />
        </div>
      );

    case "formula":
      return (
        <div className="rounded-2xl border border-border bg-card px-5 py-4 overflow-x-auto text-center">
          <RichText text={block.body} />
        </div>
      );

    case "definition":
      return (
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-foreground">
            <RichText text={block.term} />
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mt-1.5">
            <RichText text={block.body} />
          </p>
        </div>
      );

    case "callout": {
      const { Icon, className: toneClass } = CALLOUT_TONE[block.tone];
      return (
        <div className={`flex gap-3 rounded-2xl border p-4 ${toneClass}`}>
          <Icon size={18} className="shrink-0 mt-0.5" />
          {/* <div>, not <p>: RichText emits its own <p>s per paragraph. */}
          <div className="text-sm leading-relaxed">
            <RichText text={block.body} />
          </div>
        </div>
      );
    }

    case "list":
      return block.ordered ? (
        <ol className="list-decimal pl-6 space-y-1.5 text-foreground leading-relaxed marker:text-muted-foreground">
          {block.items.map((item, i) => (
            <li key={i}>
              <RichText text={item} />
            </li>
          ))}
        </ol>
      ) : (
        <ul className="list-disc pl-6 space-y-1.5 text-foreground leading-relaxed marker:text-muted-foreground">
          {block.items.map((item, i) => (
            <li key={i}>
              <RichText text={item} />
            </li>
          ))}
        </ul>
      );

    case "example":
      return (
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Example
          </p>
          {/* <div>, not <p>: RichText emits its own <p>s per paragraph. */}
          <div className="text-foreground leading-relaxed">
            <RichText text={block.statement} />
          </div>
          <ol className="list-decimal pl-6 space-y-1.5 text-sm text-muted-foreground leading-relaxed mt-3 marker:text-muted-foreground">
            {block.steps.map((step, i) => (
              <li key={i}>
                <RichText text={step} />
              </li>
            ))}
          </ol>
        </div>
      );

    default: {
      // Exhaustiveness guard: an unknown block type (a schema added without a
      // branch here) renders nothing rather than crashing the page.
      const _never: never = block;
      void _never;
      return null;
    }
  }
}
