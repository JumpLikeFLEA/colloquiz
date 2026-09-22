import type { ReactNode } from "react";
import type { InlineContent, InlineMark, InlineRun } from "@/lib/lessons";

/**
 * Renders one authored `InlineContent` field (an ordered run sequence — see
 * lib/lessons/inline.ts) to real DOM structure. Nothing here parses a
 * string: the structural representation is the point, so there is no
 * Markdown/HTML parsing step to get wrong.
 *
 * `english` renders `lang="en"` per PLAY-001's acceptance line. `mark_a`/
 * `mark_b` are distinguished from each other WITHOUT relying on colour alone
 * (PLAY-001 acceptance) — see docs/decisions/0024 for why: mark_a is a solid
 * underline over a tinted background, mark_b a dashed underline over a
 * different tint, so the two remain distinguishable in grayscale. A run may
 * carry marks in combination (an emphasized, highlighted English term), so
 * this wraps a single `<span>` in nested class toggles rather than a
 * `kind`-driven element choice.
 */

function runClassName(marks: readonly InlineMark[] | undefined): string {
  if (!marks || marks.length === 0) return "";
  const classes: string[] = [];
  if (marks.includes("mark_a")) {
    classes.push("bg-brand-subtle border-b-2 border-brand rounded-[2px] px-0.5");
  }
  if (marks.includes("mark_b")) {
    classes.push("bg-accent border-b-2 border-dashed border-foreground/50 rounded-[2px] px-0.5");
  }
  return classes.join(" ");
}

function InlineRunView({ run }: { run: InlineRun }) {
  const marks = run.marks ?? [];
  const className = runClassName(marks);
  let node: ReactNode = run.text;

  if (marks.includes("english")) {
    node = <span lang="en">{node}</span>;
  }
  if (marks.includes("emphasis")) {
    node = <em>{node}</em>;
  }
  if (className) {
    node = <span className={className}>{node}</span>;
  }
  return <>{node}</>;
}

export function InlineContentView({ content }: { content: InlineContent }) {
  return (
    <>
      {content.map((run, index) => (
        // Runs are an authored sequence with no id of their own; index is
        // stable because `content` is re-derived fresh on every parse, never
        // reordered in place.
        <InlineRunView key={index} run={run} />
      ))}
    </>
  );
}
