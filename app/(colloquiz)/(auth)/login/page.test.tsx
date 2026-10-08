import { describe, expect, it, vi } from "vitest";

/** ANON-016 — /login hands `next` to AuthScreen alongside error and notice. */
vi.mock("../AuthScreen", () => ({ AuthScreen: () => null }));

import LoginPage from "./page";

describe("LoginPage", () => {
  it.each([
    [{ error: "confirm_expired", next: "/courses/c/l" }, "confirm_expired"],
    [{ notice: "confirmed_sign_in", next: "/courses/c/l" }, null],
  ])("passes next with %j", async (params, _e) => {
    const el = await LoginPage({ searchParams: Promise.resolve(params) });
    expect(el.props.redirectTo).toBe("/courses/c/l");
    expect(el.props.initialError ?? el.props.initialNotice).toBeTruthy();
  });
});
