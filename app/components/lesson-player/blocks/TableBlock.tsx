import type { z } from "zod";
import type { TableBlockSchema } from "@/lib/lessons";
import { alliengllCopy } from "@/lib/alliengll/copy";
import { THEORY_BODY_TEXT_CLASS } from "../columnLayout";
import { InlineContentView } from "../InlineContent";

/**
 * `table` scrolls horizontally WITHIN its own container at 360px (PLAY-001
 * acceptance) — the page itself never scrolls horizontally. `overflow-x-auto`
 * is scoped to this div, not any ancestor, so a wide vocabulary table cannot
 * widen the lesson page.
 *
 * `min-w-max` (no wrapping) holds below `lg` only: on a phone, wrapping three
 * columns into ~340px is worse than scrolling. At `lg` cells wrap, so a text
 * table fits the column; the scroll stays as the fallback for a table whose
 * longest words alone are wider than the column (docs/ui-decisions.md,
 * 2026-10-12 "Lesson table wraps at lg").
 *
 * A `collapsed` table (an audio script, docs/decisions/0220) sits closed in a
 * native `<details>`, so opening it needs no JS of ours; the label swaps with
 * CSS on the `open` state.
 */
export function TableBlockView({ block }: { block: z.infer<typeof TableBlockSchema> }) {
  const table = (
    <figure className="space-y-1">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className={`w-full min-w-max lg:min-w-0 ${THEORY_BODY_TEXT_CLASS}`}>
          <thead>
            <tr className="bg-muted">
              {block.header.map((cell, index) => (
                <th key={index} scope="col" className="px-3 py-2 text-left align-top font-medium text-foreground">
                  <InlineContentView content={cell} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t border-border">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-3 py-2 align-top text-foreground">
                    <InlineContentView content={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {block.caption && (
        <figcaption className="text-xs text-muted-foreground">
          <InlineContentView content={block.caption} />
        </figcaption>
      )}
    </figure>
  );

  if (!block.collapsed) return table;

  return (
    <details className="group">
      <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 py-2.5 text-sm font-medium text-brand-text outline-none focus-visible:ring-2 focus-visible:ring-brand [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="text-xs transition-transform group-open:rotate-180 motion-reduce:transition-none">
          ▼
        </span>
        <span className="group-open:hidden">{alliengllCopy.theory.tableShow}</span>
        <span className="hidden group-open:inline">{alliengllCopy.theory.tableHide}</span>
      </summary>
      {table}
    </details>
  );
}
