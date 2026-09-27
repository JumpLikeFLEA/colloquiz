import { describe, expect, it } from "vitest";
import {
  extractClientIp,
  generateClaimToken,
  hashClaimToken,
  isWithinPayloadSizeCap,
  PENDING_CLAIM_PAYLOAD_MAX_BYTES,
} from "./pendingClaims";

describe("generateClaimToken", () => {
  it("returns a 32-char hex string (128 bits)", () => {
    const token = generateClaimToken();
    expect(token).toMatch(/^[0-9a-f]{32}$/);
  });

  it("is different on every call", () => {
    expect(generateClaimToken()).not.toBe(generateClaimToken());
  });
});

describe("hashClaimToken", () => {
  it("returns a 64-char hex string (SHA-256) matching migration 049's CHECK", () => {
    const hash = hashClaimToken(generateClaimToken());
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    const token = generateClaimToken();
    expect(hashClaimToken(token)).toBe(hashClaimToken(token));
  });

  it("differs for different tokens", () => {
    expect(hashClaimToken(generateClaimToken())).not.toBe(hashClaimToken(generateClaimToken()));
  });
});

describe("isWithinPayloadSizeCap", () => {
  it("accepts a small payload", () => {
    expect(isWithinPayloadSizeCap([{ attempt_id: "a", earned: 1, possible: 1 }])).toBe(true);
  });

  it("rejects a payload over the byte cap", () => {
    const oversized = Array.from({ length: 2000 }, (_, i) => ({
      attempt_id: `attempt-${i}`,
      lesson_version_id: "00000000-0000-0000-0000-000000000000",
      block_id: `block-${i}`,
      earned: 1,
      possible: 1,
    }));
    expect(Buffer.byteLength(JSON.stringify(oversized), "utf8")).toBeGreaterThan(
      PENDING_CLAIM_PAYLOAD_MAX_BYTES,
    );
    expect(isWithinPayloadSizeCap(oversized)).toBe(false);
  });

  it("accepts a payload right at the cap boundary", () => {
    // Build a string payload whose JSON serialization lands exactly at the cap.
    const overhead = JSON.stringify({ s: "" }).length;
    const s = "x".repeat(PENDING_CLAIM_PAYLOAD_MAX_BYTES - overhead);
    const payload = { s };
    expect(Buffer.byteLength(JSON.stringify(payload), "utf8")).toBe(PENDING_CLAIM_PAYLOAD_MAX_BYTES);
    expect(isWithinPayloadSizeCap(payload)).toBe(true);
  });
});

describe("extractClientIp", () => {
  function headersFrom(entries: Record<string, string>): Pick<Headers, "get"> {
    return { get: (name: string) => entries[name.toLowerCase()] ?? null };
  }

  it("reads the first entry of x-forwarded-for", () => {
    const headers = headersFrom({ "x-forwarded-for": "203.0.113.1, 70.41.3.18, 150.172.238.178" });
    expect(extractClientIp(headers)).toBe("203.0.113.1");
  });

  it("trims whitespace around the first entry", () => {
    const headers = headersFrom({ "x-forwarded-for": "  203.0.113.1  ,70.41.3.18" });
    expect(extractClientIp(headers)).toBe("203.0.113.1");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const headers = headersFrom({ "x-real-ip": "203.0.113.1" });
    expect(extractClientIp(headers)).toBe("203.0.113.1");
  });

  it("returns null when neither header is present", () => {
    expect(extractClientIp(headersFrom({}))).toBeNull();
  });

  it("returns null rather than an empty string for a blank header", () => {
    expect(extractClientIp(headersFrom({ "x-forwarded-for": "" }))).toBeNull();
  });
});
