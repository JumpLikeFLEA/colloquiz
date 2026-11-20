import { describe, expect, it } from "vitest";
import { offerFrom, parseOffer } from "./offer";

const URL_OK = "https://example.com/join";

describe("offerFrom", () => {
  it("offers when a linked lesson needs entitlement and the course has a join link", () => {
    expect(offerFrom(["ok", "needs_entitlement"], URL_OK)).toEqual({ howToJoinUrl: URL_OK });
  });

  it("offers nothing when every linked lesson is open to the caller (control: same url)", () => {
    expect(offerFrom(["ok", "ok"], URL_OK)).toBeNull();
    expect(offerFrom([], URL_OK)).toBeNull();
    expect(offerFrom([null], URL_OK)).toBeNull();
  });

  it("offers nothing for a sign-in or scheduled state: only entitlement is an offer", () => {
    expect(offerFrom(["needs_sign_in", "scheduled"], URL_OK)).toBeNull();
  });

  it("offers nothing without a usable join link", () => {
    expect(offerFrom(["needs_entitlement"], null)).toBeNull();
    expect(offerFrom(["needs_entitlement"], "")).toBeNull();
    expect(offerFrom(["needs_entitlement"], "javascript:alert(1)")).toBeNull();
    expect(offerFrom(["needs_entitlement"], "http://example.com")).toBeNull();
    expect(offerFrom(["needs_entitlement"], "not a url")).toBeNull();
  });
});

describe("parseOffer", () => {
  it("reads an https url and nothing else", () => {
    expect(parseOffer({ howToJoinUrl: URL_OK })).toEqual({ howToJoinUrl: URL_OK });
    expect(parseOffer({ howToJoinUrl: "javascript:alert(1)" })).toBeNull();
    expect(parseOffer({})).toBeNull();
    expect(parseOffer(null)).toBeNull();
    expect(parseOffer("https://example.com")).toBeNull();
  });
});
