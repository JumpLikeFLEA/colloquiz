/**
 * Clipboard `text/html` → the feedback editor's `**…**` text
 * (docs/decisions/0096 Decision 2). Only text, bold and paragraph breaks
 * survive; HTML is never stored or rendered.
 *
 * Bold is the EFFECTIVE weight: an element's inline `font-weight` decides
 * when it has one (600 or more, or bold/bolder, is bold), else `<b>` /
 * `<strong>` are bold, else the parent's weight carries down. So Google
 * Docs' `<b style="font-weight:normal">` wrapper is not bold, and its
 * `<span style="font-weight:700">` is (lib/feedback/__fixtures__/
 * google-docs-paste.html).
 *
 * Takes an already-parsed root so this module stays DOM-implementation
 * free: the browser passes `DOMParser`'s body, the tests pass jsdom's.
 */

export interface PasteNode {
  nodeType: number;
  nodeName: string;
  nodeValue: string | null;
  childNodes: ArrayLike<PasteNode>;
  getAttribute?: (name: string) => string | null;
}

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

const BLOCK_TAGS = new Set([
  "P", "DIV", "LI", "UL", "OL", "H1", "H2", "H3", "H4", "H5", "H6",
  "BLOCKQUOTE", "TR", "TABLE", "SECTION", "ARTICLE", "PRE",
]);
const SKIP_TAGS = new Set(["META", "STYLE", "SCRIPT", "TITLE", "HEAD", "TEMPLATE"]);

type Piece = { text: string; bold: boolean } | { br: "line" | "para" };

function inlineWeight(el: PasteNode): boolean | null {
  const style = el.getAttribute?.("style") ?? "";
  const m = /(?:^|;)\s*font-weight\s*:\s*([^;]+)/i.exec(style);
  if (!m) return null;
  const v = m[1].trim().toLowerCase().replace(/\s*!important$/, "");
  if (v === "bold" || v === "bolder") return true;
  if (v === "normal" || v === "lighter") return false;
  const n = Number(v);
  return Number.isFinite(n) ? n >= 600 : null;
}

function walk(node: PasteNode, bold: boolean, out: Piece[]): void {
  if (node.nodeType === TEXT_NODE) {
    // Source newlines in HTML are whitespace, not line breaks; <br> and
    // block boundaries are the breaks.
    const text = (node.nodeValue ?? "").replace(/\s*\n\s*/g, " ");
    if (text) out.push({ text, bold });
    return;
  }
  if (node.nodeType !== ELEMENT_NODE) return;
  const tag = node.nodeName.toUpperCase();
  if (SKIP_TAGS.has(tag)) return;
  if (tag === "BR") {
    out.push({ br: "line" });
    return;
  }
  const own = inlineWeight(node);
  const nextBold = own ?? (tag === "B" || tag === "STRONG" ? true : bold);
  const block = BLOCK_TAGS.has(tag);
  if (block) out.push({ br: "para" });
  for (let i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i], nextBold, out);
  if (block) out.push({ br: "para" });
}

export function markupFromClipboardHtml(root: PasteNode): string {
  const pieces: Piece[] = [];
  walk(root, false, pieces);

  // Group into paragraphs of lines of (text, bold) segments.
  const paragraphs: { text: string; bold: boolean }[][][] = [];
  let lines: { text: string; bold: boolean }[][] = [[]];
  const flush = () => {
    if (lines.some((l) => l.some((s) => s.text.trim() !== ""))) paragraphs.push(lines);
    lines = [[]];
  };
  for (const p of pieces) {
    if ("br" in p) {
      if (p.br === "para") flush();
      else lines.push([]);
    } else {
      lines[lines.length - 1].push(p);
    }
  }
  flush();

  return paragraphs
    .map((para) => {
      const rendered = para.map(renderLine);
      // A trailing <br> inside a block (or a stray one after it) adds no text.
      while (rendered.length > 1 && rendered[rendered.length - 1] === "") rendered.pop();
      while (rendered.length > 1 && rendered[0] === "") rendered.shift();
      return rendered.join("\n");
    })
    .join("\n\n");
}

function renderLine(segments: { text: string; bold: boolean }[]): string {
  // Merge same-weight neighbours, then wrap bold stretches in ** with the
  // surrounding whitespace kept outside the markers.
  const merged: { text: string; bold: boolean }[] = [];
  for (const s of segments) {
    const last = merged[merged.length - 1];
    if (last && last.bold === s.bold) last.text += s.text;
    else merged.push({ ...s });
  }
  const line = merged
    .map((s) => {
      if (!s.bold || s.text.trim() === "") return s.text;
      const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s.text)!;
      return `${m[1]}**${m[2]}**${m[3]}`;
    })
    .join("");
  return line.replace(/^[ \t]+|[ \t]+$/g, "");
}
