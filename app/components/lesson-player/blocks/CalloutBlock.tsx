import { AlertTriangle, Info, Lightbulb } from "lucide-react";
import type { z } from "zod";
import type { CalloutBlockSchema, CalloutVariant } from "@/lib/lessons";
import { THEORY_BODY_TEXT_CLASS } from "../layout";
import { InlineContentView } from "../InlineContent";

const VARIANT_STYLE: Record<CalloutVariant, { box: string; icon: typeof Lightbulb }> = {
  tip: { box: "border-success-border bg-success-subtle text-success", icon: Lightbulb },
  note: { box: "border-brand-border bg-brand-subtle text-brand-text", icon: Info },
  warning: { box: "border-warning-border bg-warning-subtle text-warning", icon: AlertTriangle },
};

export function CalloutBlockView({ block }: { block: z.infer<typeof CalloutBlockSchema> }) {
  const { box, icon: Icon } = VARIANT_STYLE[block.variant];
  return (
    <div className={`flex gap-2 rounded-lg border px-3 py-2 ${box}`}>
      <Icon className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
      <p className={THEORY_BODY_TEXT_CLASS}>
        <InlineContentView content={block.text} />
      </p>
    </div>
  );
}
