import { describe, expect, it } from "vitest";
import { phraseKey } from "./phraseKey";

/** The same inputs were run through 112's expression on the local stack (docs/decisions/0239). */
describe("phraseKey", () => {
  it.each([
    ["I don’t mind", "i don't mind"],
    ["I don‘t mind", "i don't mind"],
    ["I donʼt mind", "i don't mind"],
    ["I don't mind", "i don't mind"],
    ["  Be About To \t\n", "be about to"],
    [" \v\f\rkeep ", "keep"],
    ["a  b", "a  b"],
    ["ПРИВЕТ", "привет"],
    // trim() would take these two; 112 does not.
    [" x", " x"],
    ["﻿x", "﻿x"],
    ["“x”", "“x”"],
    ["", ""],
  ])("%j → %j", (phrase, key) => expect(phraseKey(phrase)).toBe(key));
});
