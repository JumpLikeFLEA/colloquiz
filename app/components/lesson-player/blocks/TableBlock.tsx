import type { z } from "zod";
import type { TableBlockSchema } from "@/lib/lessons";
import { THEORY_BODY_TEXT_CLASS } from "../layout";
import { InlineContentView } from "../InlineContent";

/**
 * `table` scrolls horizontally WITHIN its own container at 360px (PLAY-001
 * acceptance) — the page itself never scrolls horizontally. `overflow-x-auto`
 * is scoped to this div, not any ancestor, so a wide vocabulary table cannot
 * widen the lesson page.
 */
export function TableBlockView({ block }: { block: z.infer<typeof TableBlockSchema> }) {
  return (
    <figure className="space-y-1">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className={`w-full min-w-max ${THEORY_BODY_TEXT_CLASS}`}>
          <thead>
            <tr className="bg-muted">
              {block.header.map((cell, index) => (
                <th key={index} scope="col" className="px-3 py-2 text-left font-medium text-foreground">
                  <InlineContentView content={cell} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t border-border">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-3 py-2 text-foreground">
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
}
