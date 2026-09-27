import { describe, expect, it } from "vitest";
import { isInAppBrowser } from "./inAppBrowser";

describe("isInAppBrowser", () => {
  it("detects Instagram's in-app browser UA", () => {
    expect(
      isInAppBrowser(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Instagram 302.0.0.23.114",
      ),
    ).toBe(true);
  });

  it("detects Telegram's in-app browser UA", () => {
    expect(
      isInAppBrowser("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Telegram-Android/10.2.0"),
    ).toBe(true);
  });

  it("returns false for an ordinary mobile browser UA", () => {
    expect(
      isInAppBrowser(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(isInAppBrowser(null)).toBe(false);
    expect(isInAppBrowser(undefined)).toBe(false);
  });
});
