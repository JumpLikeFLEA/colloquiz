import { describe, expect, it } from "vitest";
import {
  COURSE_IMPORT_ACCEPT,
  COURSE_IMPORT_FORMATS,
  COURSE_IMPORT_FORMAT_INFO,
  COURSE_IMPORT_MAX_BYTES,
  checkUpload,
  formatFromFileName,
  importObjectName,
  isCourseImportFormat,
  isOwnImportObject,
} from "./formats";

const USER = "11111111-1111-4111-8111-111111111111";
const RANDOM = "22222222-2222-4222-8222-222222222222";

describe("formatFromFileName", () => {
  it.each([
    ["Course.PDF", "pdf"],
    ["notes.docx", "docx"],
    ["lesson.md", "markdown"],
    ["lesson.markdown", "markdown"],
    ["plain.txt", "text"],
    ["  spaced.pdf  ", "pdf"],
  ])("%s is %s", (name, format) => {
    expect(formatFromFileName(name)).toBe(format);
  });

  it.each(["slides.pptx", "old.doc", "noextension", "archive.pdf.zip", ""])("%j is not an import format", (name) => {
    expect(formatFromFileName(name)).toBeNull();
  });
});

describe("the format table", () => {
  it("has four formats, each with an extension and a content type the bucket accepts", () => {
    expect(COURSE_IMPORT_FORMATS).toHaveLength(4);
    // The bucket's allow-list in migration 103; a format added here needs the migration too.
    const bucketTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/markdown",
      "text/plain",
    ];
    expect(COURSE_IMPORT_FORMATS.map((f) => COURSE_IMPORT_FORMAT_INFO[f].contentType).sort()).toEqual([...bucketTypes].sort());
    for (const f of COURSE_IMPORT_FORMATS) expect(isCourseImportFormat(f)).toBe(true);
    expect(isCourseImportFormat("pptx")).toBe(false);
    expect(isCourseImportFormat(undefined)).toBe(false);
  });

  it("lists every extension for an <input accept>", () => {
    expect(COURSE_IMPORT_ACCEPT.split(",").sort()).toEqual([".docx", ".markdown", ".md", ".pdf", ".txt"]);
  });
});

describe("checkUpload", () => {
  it("accepts a supported file of a sane size", () => {
    expect(checkUpload("course.pdf", 1_000_000)).toEqual({ ok: true, format: "pdf" });
    expect(checkUpload("course.docx", COURSE_IMPORT_MAX_BYTES)).toEqual({ ok: true, format: "docx" });
  });

  it("refuses an unsupported type, an empty file and one over 32 MB", () => {
    expect(checkUpload("deck.pptx", 10)).toEqual({ ok: false, error: "unsupported_format" });
    expect(checkUpload("course.pdf", 0)).toEqual({ ok: false, error: "empty" });
    expect(checkUpload("course.pdf", Number.NaN)).toEqual({ ok: false, error: "empty" });
    expect(checkUpload("course.pdf", COURSE_IMPORT_MAX_BYTES + 1)).toEqual({ ok: false, error: "too_large" });
  });
});

describe("importObjectName / isOwnImportObject", () => {
  it("makes <user>/<random>.<ext> and recognises its own output", () => {
    const name = importObjectName(USER, RANDOM, "markdown");
    expect(name).toBe(`${USER}/${RANDOM}.md`);
    expect(isOwnImportObject(name, USER)).toBe(true);
  });

  it("refuses another user's folder, a nested path, a bad id and an unknown extension", () => {
    const other = "33333333-3333-4333-8333-333333333333";
    expect(isOwnImportObject(`${other}/${RANDOM}.pdf`, USER)).toBe(false);
    expect(isOwnImportObject(`${USER}/sub/${RANDOM}.pdf`, USER)).toBe(false);
    expect(isOwnImportObject(`${USER}/not-a-uuid.pdf`, USER)).toBe(false);
    expect(isOwnImportObject(`${USER}/${RANDOM}.exe`, USER)).toBe(false);
    expect(isOwnImportObject(`${USER}/${RANDOM}`, USER)).toBe(false);
  });
});
