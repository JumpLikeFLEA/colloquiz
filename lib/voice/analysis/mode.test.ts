import { describe, expect, it } from "vitest";
import { parseVoiceAnalysisMode, voiceAnalysisAction } from "./mode";

describe("voiceAnalysisAction", () => {
  it("runs only when the mode is on", () => {
    expect(voiceAnalysisAction("on")).toBe("run");
  });
  it("pauses under paused and under off", () => {
    expect(voiceAnalysisAction("paused")).toBe("pause");
    expect(voiceAnalysisAction("off")).toBe("pause");
  });
  it("fails closed for a missing or misspelt variable", () => {
    expect(voiceAnalysisAction(parseVoiceAnalysisMode(undefined))).toBe("pause");
    expect(voiceAnalysisAction(parseVoiceAnalysisMode("enabled"))).toBe("pause");
    expect(voiceAnalysisAction(parseVoiceAnalysisMode(" ON "))).toBe("run");
  });
});
