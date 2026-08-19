"use client";

import { ClientMath } from "@/app/components/clientMath";
import { CALLOUT_TONE } from "@/lib/calloutTone";
import type { TheoryBlock } from "@/lib/courseContent";

/**
 * Client-rendered mirror of TheorySection.tsx, for the stage editor's "Preview"
 * feature — draft blocks live only in the browser (unsaved), so they can't be
 * handed to TheorySection, which is deliberately a SERVER component (see its
 * own comment) that renders KaTeX server-side. Every `<RichText>` there becomes
 * `<ClientMath>` here (client-side KaTeX, already built for the editor's own
 * live field previews — see app/components/clientMath.tsx); JSX structure and
 * classes are otherwise byte-identical by construction, same convention as
 * StageEditor.tsx's blockAuthoredFields mirroring theoryBlockFields. Keep both
 * files in sync by hand — there is no shared source to generate them from.
 */
export function TheorySectionPreview({ blocks }: { blocks: TheoryBlock[] }) {
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
      return (
        <div className="text-foreground leading-relaxed">
          <ClientMath text={block.body} />
        </div>
      );

    case "formula":
      return (
        <div className="rounded-2xl border border-border bg-card px-5 py-4 overflow-x-auto text-center">
          <ClientMath text={block.body} />
        </div>
      );

    case "definition":
      return (
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-foreground">
            <ClientMath text={block.term} />
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mt-1.5">
            <ClientMath text={block.body} />
          </p>
        </div>
      );

    case "callout": {
      const { Icon, className: toneClass } = CALLOUT_TONE[block.tone];
      return (
        <div className={`flex gap-3 rounded-2xl border p-4 ${toneClass}`}>
          <Icon size={18} className="shrink-0 mt-0.5" />
          <div className="text-sm leading-relaxed">
            <ClientMath text={block.body} />
          </div>
        </div>
      );
    }

    case "list":
      return block.ordered ? (
        <ol className="list-decimal pl-6 space-y-1.5 text-foreground leading-relaxed marker:text-muted-foreground">
          {block.items.map((item, i) => (
            <li key={i}>
              <ClientMath text={item} />
            </li>
          ))}
        </ol>
      ) : (
        <ul className="list-disc pl-6 space-y-1.5 text-foreground leading-relaxed marker:text-muted-foreground">
          {block.items.map((item, i) => (
            <li key={i}>
              <ClientMath text={item} />
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
          <div className="text-foreground leading-relaxed">
            <ClientMath text={block.statement} />
          </div>
          <ol className="list-decimal pl-6 space-y-1.5 text-sm text-muted-foreground leading-relaxed mt-3 marker:text-muted-foreground">
            {block.steps.map((step, i) => (
              <li key={i}>
                <ClientMath text={step} />
              </li>
            ))}
          </ol>
        </div>
      );

    default: {
      const _never: never = block;
      void _never;
      return null;
    }
  }
}
