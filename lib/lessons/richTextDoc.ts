import { INLINE_MARKS, type InlineContent, type InlineMark, type InlineRun } from "./inline";

/**
 * Converters between the stored `InlineContent` (an array of runs, each plain
 * text plus an optional set of marks, lib/lessons/inline.ts) and the JSON
 * document the Studio rich-text field edits (AUTH-025, docs/decisions/0233).
 *
 * The document is ProseMirror's JSON shape, the one Tiptap's `getJSON()`
 * returns and `setContent()` takes. It is typed here by hand so this module
 * imports nothing from the editor package: it stays pure, testable in the
 * `unit` project, and out of every bundle that does not load the editor.
 *
 * Shape: one `paragraph`; inside it `text` nodes carrying marks named exactly
 * as the stored marks, and a `hardBreak` node for each line feed. A hard break
 * keeps the marks of the text it sits in, so a run whose text holds a line
 * feed survives the trip whole. The stored shape does not change: a line
 * break is still a `\n` inside a run's text (0224 Option A).
 */

export type RichTextMark = { type: string; attrs?: Record<string, unknown> };
export type RichTextInline =
  | { type: "text"; text: string; marks?: RichTextMark[] }
  | { type: "hardBreak"; marks?: RichTextMark[] }
  | { type: string; text?: string; marks?: RichTextMark[]; content?: RichTextInline[] };
export type RichTextBlock = { type: string; content?: RichTextInline[] };
export type RichTextDoc = { type: "doc"; content?: RichTextBlock[] };

const MARK_ORDER = new Map<InlineMark, number>(INLINE_MARKS.map((mark, index) => [mark, index]));

/** A run's marks in one canonical order (INLINE_MARKS'), repeats dropped, and
 * mark_b dropped when mark_a is also present (the two exclude each other,
 * 0022 Decision 4). Undefined for no marks. */
function canonicalMarks(marks: readonly string[] | undefined): InlineMark[] | undefined {
  if (!marks || marks.length === 0) return undefined;
  const set = new Set<InlineMark>();
  for (const mark of marks) {
    if (MARK_ORDER.has(mark as InlineMark)) set.add(mark as InlineMark);
  }
  if (set.has("mark_a")) set.delete("mark_b");
  if (set.size === 0) return undefined;
  return Array.from(set).sort((a, b) => MARK_ORDER.get(a)! - MARK_ORDER.get(b)!);
}

function sameMarks(a: InlineMark[] | undefined, b: InlineMark[] | undefined): boolean {
  const x = a ?? [];
  const y = b ?? [];
  return x.length === y.length && x.every((mark, i) => mark === y[i]);
}

function makeRun(text: string, marks: InlineMark[] | undefined): InlineRun {
  return marks ? { text, marks } : { text };
}

/**
 * The canonical form of a run list: CR/CRLF as LF, marks in canonical order,
 * empty runs dropped, adjacent runs with the same marks merged, and an empty
 * field as `[{ text: "" }]` (so the schema refuses it exactly as it refused
 * the old editor's cleared field). `docToRuns(runsToDoc(x))` equals
 * `normalizeRuns(x)` for every run list.
 */
export function normalizeRuns(runs: readonly { text: string; marks?: readonly string[] }[]): InlineContent {
  const out: InlineRun[] = [];
  for (const run of runs) {
    const text = run.text.replace(/\r\n?/g, "\n");
    if (text === "") continue;
    const marks = canonicalMarks(run.marks);
    const last = out[out.length - 1];
    if (last && sameMarks(last.marks, marks)) {
      out[out.length - 1] = makeRun(last.text + text, marks);
    } else {
      out.push(makeRun(text, marks));
    }
  }
  return out.length > 0 ? out : [{ text: "" }];
}

function toDocMarks(marks: InlineMark[] | undefined): RichTextMark[] | undefined {
  return marks ? marks.map((type) => ({ type })) : undefined;
}

/** Stored runs → the editor's document. */
export function runsToDoc(runs: readonly InlineRun[]): RichTextDoc {
  const content: RichTextInline[] = [];
  for (const run of normalizeRuns(runs)) {
    if (run.text === "") continue;
    const marks = toDocMarks(run.marks);
    run.text.split("\n").forEach((line, index) => {
      if (index > 0) content.push(marks ? { type: "hardBreak", marks } : { type: "hardBreak" });
      if (line !== "") content.push(marks ? { type: "text", text: line, marks } : { type: "text", text: line });
    });
  }
  return { type: "doc", content: [content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" }] };
}

/**
 * The editor's document → stored runs. Every paragraph is read (a second one
 * is joined with a line feed, in case a paste ever made one), text nodes keep
 * their marks, a hard break is a line feed with its own marks, and anything
 * else (an unknown node or mark) is dropped.
 */
export function docToRuns(doc: RichTextDoc | null | undefined): InlineContent {
  const raw: { text: string; marks?: string[] }[] = [];
  const paragraphs = doc?.content ?? [];
  paragraphs.forEach((block, blockIndex) => {
    if (blockIndex > 0) raw.push({ text: "\n" });
    for (const node of block.content ?? []) {
      const marks = node.marks?.map((mark) => mark.type);
      if (node.type === "text" && typeof node.text === "string") {
        raw.push({ text: node.text, marks });
      } else if (node.type === "hardBreak") {
        raw.push({ text: "\n", marks });
      }
    }
  });
  return normalizeRuns(raw);
}
