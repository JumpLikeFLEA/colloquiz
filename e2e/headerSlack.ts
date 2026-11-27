/**
 * SHELL-040 (docs/decisions/0252): how much room a top bar has left, per row.
 * `scrollWidth <= clientWidth` is not enough: on the landing the labelled pill
 * made the wordmark wrap onto two lines while the header still reported
 * 328/328, because wrapped text never overflows.
 *
 * For each direct child of the header, "need" is its max-content width (the
 * width it takes without wrapping), measured by setting `width: max-content`
 * for a moment. Per row, slack is the header's width less what the row needs:
 *   - a flex header: the needs of everything on that row (items grouped by
 *     vertical centre) plus the gaps;
 *   - a grid header: every column's widest need plus the gaps (see below).
 * A child with nothing to show (width 0) is skipped.
 */

import type { Page } from "@playwright/test";

export type RowSlack = { row: number; items: string; need: number; box: number; slack: number };

export async function headerSlack(page: Page): Promise<RowSlack[]> {
  return page.evaluate(() => {
    const h = document.querySelector("header") as HTMLElement | null;
    if (!h) throw new Error("no <header> on the page");
    const cs = getComputedStyle(h);
    const kids = ([...h.children] as HTMLElement[]).filter((e) => e.getBoundingClientRect().width > 0);
    const need = (e: HTMLElement) => {
      const old = [e.style.width, e.style.justifySelf, e.style.flex];
      e.style.width = "max-content";
      e.style.justifySelf = "start";
      e.style.flex = "none";
      const w = e.getBoundingClientRect().width;
      [e.style.width, e.style.justifySelf, e.style.flex] = old;
      return Math.ceil(w);
    };
    const label = (e: HTMLElement) => (e.getAttribute("aria-label") ?? e.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 18);
    const centre = (e: HTMLElement) => {
      const r = e.getBoundingClientRect();
      return Math.round(r.top + r.height / 2);
    };
    // Group by row (vertical centre within 12px).
    const rows: HTMLElement[][] = [];
    for (const e of kids) {
      const row = rows.find((r) => Math.abs(centre(r[0]) - centre(e)) < 12);
      if (row) row.push(e);
      else rows.push([e]);
    }
    const left = h.getBoundingClientRect().left + parseFloat(cs.paddingLeft);
    const out: { row: number; items: string; need: number; box: number; slack: number }[] = [];
    if (cs.display === "grid") {
      // An `auto` track always widens to its widest item, so the shortage, if
      // any, lands on the `1fr` track beside it. What the grid can absorb is the
      // header width less every column's widest need and the gaps; every row
      // spans every column, so each row reports that figure, with its items'
      // needs against their tracks.
      const tracks = cs.gridTemplateColumns.split(" ").map(parseFloat);
      const gap = parseFloat(cs.columnGap) || 0;
      const starts = tracks.map((_, i) => tracks.slice(0, i).reduce((a, b) => a + b + gap, 0));
      const colOf = (e: HTMLElement) => {
        const x = e.getBoundingClientRect().left - left;
        let col = 0;
        starts.forEach((s, i) => {
          if (x >= s - 1) col = i;
        });
        return col;
      };
      const needs = new Map(kids.map((e) => [e, need(e)]));
      const colMax = tracks.map((_, c) => Math.max(0, ...kids.filter((e) => colOf(e) === c).map((e) => needs.get(e)!)));
      const width = h.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const used = colMax.reduce((a, b) => a + b, 0) + gap * (tracks.length - 1);
      rows.forEach((r, ri) =>
        out.push({
          row: ri + 1,
          items: r.map((e) => `${label(e)} ${needs.get(e)}/${Math.round(tracks[colOf(e)])}`).join(" + "),
          need: used,
          box: Math.floor(width),
          slack: Math.floor(width) - used,
        }),
      );
    } else {
      const gap = parseFloat(cs.columnGap) || 0;
      rows.forEach((r, ri) => {
        const n = r.reduce((a, e) => a + need(e), 0) + gap * (r.length - 1);
        out.push({ row: ri + 1, items: r.map(label).join(" + "), need: n, box: h.clientWidth, slack: h.clientWidth - n });
      });
    }
    return out;
  });
}
