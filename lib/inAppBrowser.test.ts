import { describe, expect, it } from "vitest";
import { isInAppBrowser, isOAuthProviderAvailable } from "./inAppBrowser";

const INSTAGRAM_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Instagram 302.0.0.23.114";
const TELEGRAM_UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Telegram-Android/10.2.0";
const SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

describe("isOAuthProviderAvailable", () => {
  it("offers every provider in an ordinary browser, and when the UA is unknown", () => {
    for (const provider of ["google", "discord", "custom:telegram"] as const) {
      expect(isOAuthProviderAvailable(provider, SAFARI_UA)).toBe(true);
      expect(isOAuthProviderAvailable(provider, null)).toBe(true);
    }
  });

  it("keeps Google and Discord hidden inside both in-app browsers", () => {
    for (const ua of [INSTAGRAM_UA, TELEGRAM_UA]) {
      expect(isOAuthProviderAvailable("google", ua)).toBe(false);
      expect(isOAuthProviderAvailable("discord", ua)).toBe(false);
    }
  });

  it("keeps Telegram hidden inside both in-app browsers until a device pass proves it (0098 Decision 1)", () => {
    expect(isOAuthProviderAvailable("custom:telegram", INSTAGRAM_UA)).toBe(false);
    expect(isOAuthProviderAvailable("custom:telegram", TELEGRAM_UA)).toBe(false);
  });
});

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
