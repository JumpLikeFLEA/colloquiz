import type { FeedbackContent, FeedbackRun } from "./content";

/**
 * The feedback editor's text form ↔ FeedbackContent (docs/decisions/0096
 * Decisions 2–3). The editor is a plain `<textarea>`; bold is written as
 * `**…**`. This conversion runs on SAVE (and for the live preview, which
 * renders the same output); nothing parses markup at render time.
 *
 * Rules:
 *   - a blank line (only whitespace between two newlines) starts a new
 *     paragraph; a single newline stays inside the run text as "\n";
 *   - `**` markers pair left to right inside a paragraph; an unmatched last
 *     `**` stays literal text; an empty pair (`****`) is dropped;
 *   - adjacent runs with the same weight are merged, empty runs and empty
 *     paragraphs are dropped.
 *
 * Returns null when nothing is left (an empty editor), which the caller
 * treats as "nothing to save" — FeedbackContent needs at least one run.
 */
export function feedbackFromMarkup(markup: string): FeedbackContent | null {
  const paragraphs: FeedbackContent["paragraphs"] = [];
  for (const raw of markup.replace(/\r\n?/g, "\n").split(/\n(?:[ \t]*\n)+/)) {
    if (raw.trim() === "") continue;
    const text = raw.replace(/^(?:[ \t]*\n)+/, "").replace(/(?:\n[ \t]*)+$/, "");
    const runs = parseRuns(text);
    if (runs.length > 0) paragraphs.push({ runs });
  }
  return paragraphs.length > 0 ? { paragraphs } : null;
}

function parseRuns(text: string): FeedbackRun[] {
  const parts = text.split("**");
  // n markers make n+1 parts. With an odd marker count the last marker has
  // no partner, so it is glued back onto the text after it as a literal.
  if (parts.length % 2 === 0) {
    const tail = parts.pop() ?? "";
    parts[parts.length - 1] += "**" + tail;
  }
  const runs: FeedbackRun[] = [];
  parts.forEach((part, i) => {
    if (part === "") return;
    const bold = i % 2 === 1;
    const last = runs[runs.length - 1];
    if (last && Boolean(last.bold) === bold) {
      last.text += part;
    } else {
      runs.push(bold ? { text: part, bold: true } : { text: part });
    }
  });
  return runs;
}

/**
 * The inverse, for opening a saved draft or published feedback in the
 * editor. Round-trips every FeedbackContent whose run text contains no
 * literal `**` (a literal pair would be read back as bold on the next save;
 * see docs/decisions/0114).
 */
export function markupFromFeedback(content: FeedbackContent): string {
  return content.paragraphs
    .map((p) => p.runs.map((r) => (r.bold ? `**${r.text}**` : r.text)).join(""))
    .join("\n\n");
}

export type TextSelection = { text: string; start: number; end: number };

/**
 * The Bold button and Ctrl+B (0096 Decision 2): wrap the selection in `**`,
 * or unwrap it when it is already wrapped, either by markers just outside
 * the selection or by markers it includes. With nothing selected, inserts
 * an empty pair and puts the caret between the markers. Returns the new
 * text and the selection to restore (the same words, without/with markers).
 */
export function toggleBold({ text, start, end }: TextSelection): TextSelection {
  const before = text.slice(0, start);
  const selected = text.slice(start, end);
  const after = text.slice(end);

  if (before.endsWith("**") && after.startsWith("**")) {
    return { text: before.slice(0, -2) + selected + after.slice(2), start: start - 2, end: end - 2 };
  }
  if (selected.length >= 4 && selected.startsWith("**") && selected.endsWith("**")) {
    const inner = selected.slice(2, -2);
    return { text: before + inner + after, start, end: start + inner.length };
  }
  // Keep a selection's edge whitespace outside the markers, as paste does.
  const lead = /^\s*/.exec(selected)![0];
  const trail = selected.length > lead.length ? /\s*$/.exec(selected)![0] : "";
  const core = selected.slice(lead.length, selected.length - trail.length);
  const s = start + lead.length + 2;
  return { text: before + lead + "**" + core + "**" + trail + after, start: s, end: s + core.length };
}
