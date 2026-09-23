import { describe, expect, it } from "vitest";
import { mapParseErrorsToFieldErrors } from "./lessonEditorErrors";

describe("mapParseErrorsToFieldErrors", () => {
  it("groups field-level errors under their block id and field path", () => {
    const map = mapParseErrorsToFieldErrors([
      { field: "blk_1: text", message: "text array must contain at least 1 element(s)" },
      { field: "blk_2: rows[1]", message: "row has 1 cell(s), header has 2" },
    ]);

    expect(map.get("blk_1")?.get("text")).toEqual(["text array must contain at least 1 element(s)"]);
    expect(map.get("blk_2")?.get("rows[1]")).toEqual(["row has 1 cell(s), header has 2"]);
  });

  it("puts a block-only error (no field path) under the empty field key", () => {
    const map = mapParseErrorsToFieldErrors([
      { field: "blk_3", message: 'duplicate block id "blk_3"' },
    ]);

    expect(map.get("blk_3")?.get("")).toEqual(['duplicate block id "blk_3"']);
  });

  it("puts a document-level error (empty field) under the empty block key", () => {
    const map = mapParseErrorsToFieldErrors([
      { field: "", message: "lesson document must be a JSON array of blocks" },
    ]);

    expect(map.get("")?.get("")).toEqual(["lesson document must be a JSON array of blocks"]);
  });

  it("collects multiple messages for the same block/field", () => {
    const map = mapParseErrorsToFieldErrors([
      { field: "blk_1: text", message: "first error" },
      { field: "blk_1: text", message: "second error" },
    ]);

    expect(map.get("blk_1")?.get("text")).toEqual(["first error", "second error"]);
  });
});
