import { convertDocxToHtml } from "./docx";
import { COURSE_IMPORT_MAX_TEXT_CHARS, type CourseImportFormat } from "./formats";
import { ImportStepError } from "./errors";

/**
 * The text of a non-PDF file, as the model is shown it (CNT-018, docs/decisions/0203
 * Decision 2). Markdown and text are decoded as UTF-8; DOCX goes through mammoth to HTML, so
 * tables and lists keep their structure. A PDF is not read here: it goes to Claude as a
 * document, through the Files API.
 */

export type TextSource = {
  text: string;
  imagesDropped: number;
  warnings: string[];
};

export async function textSourceFromBytes(format: Exclude<CourseImportFormat, "pdf">, bytes: Uint8Array): Promise<TextSource> {
  let text: string;
  let imagesDropped = 0;
  let warnings: string[] = [];

  if (format === "docx") {
    try {
      const converted = await convertDocxToHtml(bytes);
      text = converted.html;
      imagesDropped = converted.imagesDropped;
      warnings = converted.warnings;
    } catch {
      throw new ImportStepError("DOCX could not be converted", "docx_unreadable", false);
    }
  } else {
    text = new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  }

  if (text.trim().length === 0) throw new ImportStepError("file has no text", "empty_file", false);
  if (text.length > COURSE_IMPORT_MAX_TEXT_CHARS) throw new ImportStepError("file text is too long", "file_too_long", false);
  return { text, imagesDropped, warnings };
}
