import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FeedbackContentSchema } from "./content";
import { feedbackFromMarkup, markupFromFeedback, toggleBold } from "./markup";
import { markupFromClipboardHtml, type PasteNode } from "./paste";

// jsdom ships no types and @types/jsdom is not a dependency; this test needs
// only the constructor and document.body. Loaded here rather than through
// the jsdom test environment so the suite stays in the node "unit" project.
const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (html: string) => { window: { document: { body: unknown } } };
};

function body(html: string): PasteNode {
  return new JSDOM(html).window.document.body as PasteNode;
}

describe("feedbackFromMarkup (0096 Decisions 2–3)", () => {
  it("splits paragraphs on a blank line and keeps a single newline as a line break", () => {
    expect(feedbackFromMarkup("Good work.\nKeep going.\n\n  \nNext one")).toEqual({
      paragraphs: [{ runs: [{ text: "Good work.\nKeep going." }] }, { runs: [{ text: "Next one" }] }],
    });
  });

  it("turns **…** into bold runs", () => {
    expect(feedbackFromMarkup("Your **th** sound is **much** better")).toEqual({
      paragraphs: [
        {
          runs: [
            { text: "Your " },
            { text: "th", bold: true },
            { text: " sound is " },
            { text: "much", bold: true },
            { text: " better" },
          ],
        },
      ],
    });
  });

  it("keeps an unmatched ** as literal text", () => {
    expect(feedbackFromMarkup("a **b** c ** d")).toEqual({
      paragraphs: [{ runs: [{ text: "a " }, { text: "b", bold: true }, { text: " c ** d" }] }],
    });
    expect(feedbackFromMarkup("only ** one")).toEqual({ paragraphs: [{ runs: [{ text: "only ** one" }] }] });
  });

  it("drops an empty pair (****)", () => {
    expect(feedbackFromMarkup("a****b")).toEqual({ paragraphs: [{ runs: [{ text: "ab" }] }] });
    expect(feedbackFromMarkup("****\n\nx")).toEqual({ paragraphs: [{ runs: [{ text: "x" }] }] });
  });

  it("does not pair markers across a paragraph break", () => {
    expect(feedbackFromMarkup("**a\n\nb**")).toEqual({
      paragraphs: [{ runs: [{ text: "**a" }] }, { runs: [{ text: "b**" }] }],
    });
  });

  it("returns null for an empty editor", () => {
    expect(feedbackFromMarkup("")).toBeNull();
    expect(feedbackFromMarkup(" \n\n \n")).toBeNull();
  });

  it("produces content the schema (and so the SQL validator's shape) accepts", () => {
    const c = feedbackFromMarkup("**Great** start.\nTry again\n\nBye **");
    expect(c).not.toBeNull();
    expect(FeedbackContentSchema.safeParse(c).success).toBe(true);
  });

  it("round-trips through markupFromFeedback", () => {
    const text = "Your **th** sound\nis better.\n\n**Well done.**";
    expect(markupFromFeedback(feedbackFromMarkup(text)!)).toBe(text);
  });
});

describe("markupFromClipboardHtml (0096 Decision 2)", () => {
  it("reads the committed Google Docs sample: font-weight spans, <p> paragraphs, trailing <br>", () => {
    const html = readFileSync(join(__dirname, "__fixtures__/google-docs-paste.html"), "utf8");
    const markup = markupFromClipboardHtml(body(html));
    expect(markup).toBe(
      '**The session is right to stop.** My block went through with "[paste it here]" still in it, so it has no Docs sample.' +
        "\n\n" +
        "It's also right not to write the converter on a decision card. That means my item 4 asked for too much: " +
        "VOICE-002 only needs the real sample committed as a fixture. The converter and the test that runs it against " +
        "the sample belong to VOICE-006. Skip the VOICE-004 note as well. That card already says it uses VOICE-002's " +
        "shape, which points to 0096 and its 5,000-character cap.",
    );
    const content = feedbackFromMarkup(markup)!;
    expect(content.paragraphs[0].runs[0]).toEqual({ text: "The session is right to stop.", bold: true });
    expect(content.paragraphs).toHaveLength(2);
  });

  it("does not treat Docs' <b style=\"font-weight:normal\"> wrapper as bold", () => {
    const html =
      '<b style="font-weight:normal;"><span style="font-weight:400">plain </span><span style="font-weight:700">bold</span></b>';
    expect(markupFromClipboardHtml(body(html))).toBe("plain **bold**");
  });

  it("reads <b>/<strong>, <br> and list items", () => {
    const html = "<p>One <strong>two</strong><br>three</p><ul><li>a</li><li><b>b</b></li></ul>";
    expect(markupFromClipboardHtml(body(html))).toBe("One **two**\nthree\n\na\n\n**b**");
  });

  it("keeps whitespace outside the markers and drops meta/style", () => {
    const html = '<meta charset="utf-8"><style>p{}</style><p>x<b> y </b>z</p>';
    expect(markupFromClipboardHtml(body(html))).toBe("x **y** z");
  });
});

describe("toggleBold (0096 Decision 2)", () => {
  it("wraps a selection and selects the same words inside the markers", () => {
    expect(toggleBold({ text: "say hello now", start: 4, end: 9 })).toEqual({ text: "say **hello** now", start: 6, end: 11 });
  });
  it("unwraps when the markers sit just outside the selection", () => {
    expect(toggleBold({ text: "say **hello** now", start: 6, end: 11 })).toEqual({ text: "say hello now", start: 4, end: 9 });
  });
  it("unwraps when the selection includes the markers", () => {
    expect(toggleBold({ text: "say **hello** now", start: 4, end: 13 })).toEqual({ text: "say hello now", start: 4, end: 9 });
  });
  it("keeps edge whitespace outside the markers", () => {
    expect(toggleBold({ text: "a b c", start: 1, end: 4 })).toEqual({ text: "a **b** c", start: 4, end: 5 });
  });
  it("inserts an empty pair with the caret inside when nothing is selected", () => {
    expect(toggleBold({ text: "ab", start: 1, end: 1 })).toEqual({ text: "a****b", start: 3, end: 3 });
  });
  it("a wrap then an unwrap restores the text", () => {
    const wrapped = toggleBold({ text: "one two", start: 0, end: 3 });
    expect(toggleBold(wrapped).text).toBe("one two");
  });
});
