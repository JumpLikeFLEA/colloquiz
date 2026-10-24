import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { convertDocxToHtml } from "./docx";
import { textSourceFromBytes } from "./source";
import { ImportStepError } from "./errors";

const sample = new Uint8Array(readFileSync(join(__dirname, "__fixtures__", "sample.docx")));

describe("convertDocxToHtml", () => {
  it("keeps a table as a table, cell for cell", async () => {
    const { html } = await convertDocxToHtml(sample);
    expect(html).toContain("<table>");
    const rows = [...html.matchAll(/<tr>(.*?)<\/tr>/g)].map((m) =>
      [...m[1].matchAll(/<td>(?:<p>)?(.*?)(?:<\/p>)?<\/td>/g)].map((c) => c[1]),
    );
    expect(rows).toEqual([
      ["Tense", "Signal", "Example"],
      ["Past simple", "yesterday", "Clarke wrote it in 1945."],
      ["Present perfect", "already", "She has already finished."],
    ]);
  });

  it("keeps the heading and the paragraph", async () => {
    const { html } = await convertDocxToHtml(sample);
    expect(html).toContain("<h1>Section A: Past and present</h1>");
    expect(html).toContain("<p>Use the present perfect for a result that matters now.</p>");
  });

  it("drops the embedded image and counts it", async () => {
    const result = await convertDocxToHtml(sample);
    expect(result.imagesDropped).toBe(1);
    expect(result.html).not.toContain("<img");
  });

  it("rejects bytes that are not a DOCX", async () => {
    await expect(convertDocxToHtml(new TextEncoder().encode("not a zip"))).rejects.toBeTruthy();
  });
});

describe("textSourceFromBytes", () => {
  it("converts a DOCX and reports what the conversion lost", async () => {
    const source = await textSourceFromBytes("docx", sample);
    expect(source.text).toContain("<table>");
    expect(source.imagesDropped).toBe(1);
  });

  it("turns an unreadable DOCX into a non-retryable docx_unreadable", async () => {
    const err = await textSourceFromBytes("docx", new TextEncoder().encode("nope")).catch((e) => e);
    expect(err).toBeInstanceOf(ImportStepError);
    expect(err).toMatchObject({ code: "docx_unreadable", transient: false });
  });

  it("decodes Markdown and text as UTF-8, dropping a BOM and normalising line ends", async () => {
    const bytes = new TextEncoder().encode("﻿# Title\r\nline two\rline three");
    const source = await textSourceFromBytes("markdown", bytes);
    expect(source.text).toBe("# Title\nline two\nline three");
    expect(source.imagesDropped).toBe(0);
  });

  it("keeps Cyrillic intact", async () => {
    const source = await textSourceFromBytes("text", new TextEncoder().encode("Настоящее совершённое время"));
    expect(source.text).toBe("Настоящее совершённое время");
  });

  it("refuses an empty file and a file past the text cap", async () => {
    await expect(textSourceFromBytes("text", new TextEncoder().encode("  \n "))).rejects.toMatchObject({ code: "empty_file" });
    await expect(textSourceFromBytes("text", new TextEncoder().encode("a".repeat(800_001)))).rejects.toMatchObject({
      code: "file_too_long",
    });
    // The edge: exactly at the cap is accepted (guards the refusal above against an off-by-one).
    const atCap = await textSourceFromBytes("text", new TextEncoder().encode("a".repeat(800_000)));
    expect(atCap.text).toHaveLength(800_000);
  });
});
