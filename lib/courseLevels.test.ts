import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CEFR_LEVELS } from "./courseLevels";

describe("CEFR_LEVELS", () => {
  it("is exactly the six CEFR levels, in ascending order", () => {
    expect(CEFR_LEVELS).toEqual(["A1", "A2", "B1", "B2", "C1", "C2"]);
  });

  it("matches migration 042's courses_level_check CHECK constraint verbatim", () => {
    // Re-derived from the source file rather than re-typed, so this test
    // actually catches drift between the two instead of restating the same
    // literal twice.
    const migration = readFileSync(
      path.resolve(__dirname, "..", "supabase", "migrations", "042_catalog_metadata.sql"),
      "utf-8",
    );
    const match = migration.match(/CHECK \(level IN \(([^)]+)\)\)/);
    expect(match).not.toBeNull();
    const levelsInMigration = match![1].split(",").map((s) => s.trim().replace(/'/g, ""));
    expect(levelsInMigration).toEqual([...CEFR_LEVELS]);
  });
});
