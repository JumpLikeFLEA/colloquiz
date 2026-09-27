import { describe, expect, it } from "vitest";
import { unwrapNext } from "./route";

/**
 * ANON-004 — `unwrapNext` tells apart the two shapes `next` arrives in
 * (docs/decisions/0068's "what would make us revisit this"), confirmed
 * empirically against a local Supabase stack (Mailpit): a bare path, for the
 * existing recovery/default flow, vs. the whole `emailRedirectTo` URL
 * `RegistrationOffer` passes, which this project's custom "confirmation"
 * template (supabase/templates/confirmation.html) wraps verbatim inside its
 * own `next={{ .RedirectTo }}`.
 */
describe("unwrapNext", () => {
  it("passes a bare path through unchanged (existing recovery/default flow)", () => {
    expect(unwrapNext("/reset-password", null)).toEqual({ next: "/reset-password", claim: null });
  });

  it("defaults to itself with no claim when given the root path", () => {
    expect(unwrapNext("/", null)).toEqual({ next: "/", claim: null });
  });

  it("unwraps a full confirm URL, recovering its own next and claim params", () => {
    const wrapped = "http://localhost:3000/auth/confirm?next=%2Fcourses%2Fc%2Fl&claim=TESTCLAIM123";
    expect(unwrapNext(wrapped, null)).toEqual({ next: "/courses/c/l", claim: "TESTCLAIM123" });
  });

  it("unwraps a full confirm URL with no claim in it", () => {
    const wrapped = "http://localhost:3000/auth/confirm?next=%2Fcourses%2Fc%2Fl";
    expect(unwrapNext(wrapped, null)).toEqual({ next: "/courses/c/l", claim: null });
  });

  it("prefers a top-level claim over one nested inside the wrapped URL", () => {
    const wrapped = "http://localhost:3000/auth/confirm?next=%2Fcourses%2Fc%2Fl&claim=inner";
    expect(unwrapNext(wrapped, "outer")).toEqual({ next: "/courses/c/l", claim: "outer" });
  });

  it("falls back to the wrapped URL itself if it has no inner next param", () => {
    const wrapped = "http://localhost:3000/auth/confirm";
    expect(unwrapNext(wrapped, null)).toEqual({ next: wrapped, claim: null });
  });
});
