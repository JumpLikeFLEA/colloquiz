import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LineBreaks } from "./LineBreaks";
import { InlineContentView } from "./InlineContent";

// AUTH-025 (docs/decisions/0233): a line feed in authored text is drawn as <br>.
describe("LineBreaks", () => {
  it("leaves text with no line feed as the plain string", () => {
    expect(renderToStaticMarkup(<LineBreaks text="one line" />)).toBe("one line");
  });

  it("draws each line feed as a <br>, keeping empty lines", () => {
    expect(renderToStaticMarkup(<LineBreaks text={"a\nb\n\nc"} />)).toBe("a<br/>b<br/><br/>c");
  });
});

describe("InlineContentView", () => {
  it("draws a line feed inside a marked run as a <br> within the mark", () => {
    const html = renderToStaticMarkup(
      <InlineContentView content={[{ text: "First " }, { text: "word\nSecond", marks: ["emphasis"] }]} />,
    );
    expect(html).toBe("First <em>word<br/>Second</em>");
  });
});
