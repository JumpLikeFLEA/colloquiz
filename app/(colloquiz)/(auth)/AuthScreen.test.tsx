import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { unwrapNext } from "@/app/auth/confirm/route";
import { AuthScreen } from "./AuthScreen";

/**
 * ANON-014 (docs/decisions/0085) — what AuthScreen hands Supabase as the
 * email and OAuth redirect, by entry point. The routes that read those URLs
 * are covered by app/auth/confirm/route.acquisition.test.ts and
 * app/auth/callback/route.test.ts; this file proves the URLs carry `next`
 * and `source` there in the first place.
 */

const signUp = vi.fn().mockResolvedValue({ data: { session: null }, error: null });
const signInWithOAuth = vi.fn().mockResolvedValue({ error: null });

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signUp, signInWithOAuth } }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const SOURCE_KEY = "colloquiz_funnel_source";

function setGpc(value: boolean | undefined) {
  Object.defineProperty(window.navigator, "globalPrivacyControl", { value, configurable: true });
}

async function submitEmailSignup() {
  fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "Ann" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ann@example.com" } });
  fireEvent.change(screen.getByLabelText("City"), { target: { value: "Belgrade" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "correct-horse-1" } });
  fireEvent.change(screen.getByLabelText("Confirm Password"), { target: { value: "correct-horse-1" } });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: /Create Account/ }));
  await waitFor(() => expect(signUp).toHaveBeenCalledTimes(1));
  return signUp.mock.calls[0][0].options.emailRedirectTo as string;
}

async function clickGoogle() {
  fireEvent.click(screen.getByRole("button", { name: /Google/ }));
  await waitFor(() => expect(signInWithOAuth).toHaveBeenCalledTimes(1));
  return new URL(signInWithOAuth.mock.calls[0][0].options.redirectTo as string);
}

beforeEach(() => {
  // The landing page classified this tab as telegram (EntryViewBeacon).
  window.sessionStorage.setItem(SOURCE_KEY, "telegram");
});

afterEach(() => {
  cleanup();
  signUp.mockClear();
  signInWithOAuth.mockClear();
  window.sessionStorage.clear();
  setGpc(undefined);
});

describe("AuthScreen — English entry (the landing header's /login?next=/)", () => {
  it("email signup reaches /auth/confirm with next and source", async () => {
    render(<AuthScreen initialMode="register" redirectTo="/" />);
    const redirect = await submitEmailSignup();
    expect(new URL(redirect).pathname).toBe("/auth/confirm");
    // The confirmation template sends this whole URL back as `next`.
    expect(unwrapNext(redirect, null, null)).toEqual({ next: "/", claim: null, source: "telegram" });
  });

  it("OAuth reaches /auth/callback with next and source", async () => {
    render(<AuthScreen initialMode="login" redirectTo="/" />);
    const url = await clickGoogle();
    expect(url.pathname).toBe("/auth/callback");
    expect(url.searchParams.get("next")).toBe("/");
    expect(url.searchParams.get("source")).toBe("telegram");
  });

  it("Telegram (ANON-012) signs in through the custom provider and keeps a lesson's next and the source", async () => {
    render(<AuthScreen initialMode="login" redirectTo="/courses/c/l" />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Telegram" }));
    await waitFor(() => expect(signInWithOAuth).toHaveBeenCalledTimes(1));
    const args = signInWithOAuth.mock.calls[0][0];
    expect(args.provider).toBe("custom:telegram");
    expect(args.options.queryParams).toBeUndefined();
    const url = new URL(args.options.redirectTo as string);
    expect(url.pathname).toBe("/auth/callback");
    expect(url.searchParams.get("next")).toBe("/courses/c/l");
    expect(url.searchParams.get("source")).toBe("telegram");
  });

  it("the sign-up consent note names Telegram with the other providers", () => {
    render(<AuthScreen initialMode="register" redirectTo="/" />);
    expect(screen.getByText(/Signing up with Telegram, Google or Discord also confirms/)).toBeDefined();
  });

  it("a GPC visitor sends no source by either method, and storage is not read", async () => {
    setGpc(true);
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    render(<AuthScreen initialMode="register" redirectTo="/" />);
    const redirect = await submitEmailSignup();
    expect(unwrapNext(redirect, null, null)).toEqual({ next: "/", claim: null, source: null });
    cleanup();
    render(<AuthScreen initialMode="login" redirectTo="/" />);
    const url = await clickGoogle();
    // next=/ is /auth/callback's own default, so the callback is bare.
    expect(url.toString()).toBe(`${window.location.origin}/auth/callback`);
    expect(getItem).not.toHaveBeenCalledWith(SOURCE_KEY);
    getItem.mockRestore();
  });
});

describe("AuthScreen — Colloquiz entry", () => {
  it("a bare /signup sends no source, but the email redirect still carries next", async () => {
    render(<AuthScreen initialMode="register" />);
    const redirect = await submitEmailSignup();
    expect(unwrapNext(redirect, null, null)).toEqual({ next: "/", claim: null, source: null });
  });

  it("a bare /login OAuth callback is unchanged", async () => {
    render(<AuthScreen initialMode="login" />);
    const url = await clickGoogle();
    expect(url.toString()).toBe(`${window.location.origin}/auth/callback`);
  });

  it("a next under /app sends no source by either method", async () => {
    render(<AuthScreen initialMode="register" redirectTo="/app/s/abc" />);
    const redirect = await submitEmailSignup();
    expect(unwrapNext(redirect, null, null)).toEqual({ next: "/app/s/abc", claim: null, source: null });
    cleanup();
    render(<AuthScreen initialMode="login" redirectTo="/app/s/abc" />);
    const url = await clickGoogle();
    expect(url.searchParams.get("next")).toBe("/app/s/abc");
    expect(url.searchParams.has("source")).toBe(false);
  });
});

describe("AuthScreen — panel by entry (ANON-017)", () => {
  afterEach(cleanup);

  it("English-surface next shows the Alina Cher panel, not the quiz copy", () => {
    render(<AuthScreen initialMode="login" redirectTo="/courses/future-imperfect/lesson-1" />);
    expect(screen.getByText(/save your progress/)).toBeTruthy();
    expect(screen.queryByText(/advertisement/)).toBeNull();
    expect(screen.queryByText("Mathematics")).toBeNull();
  });

  it.each([undefined, "/app", "/app/dashboard"])("next=%s keeps the Colloquiz panel", (next) => {
    render(<AuthScreen initialMode="login" redirectTo={next} />);
    expect(screen.getByText(/advertisement/)).toBeTruthy();
    expect(screen.queryByText(/save your progress/)).toBeNull();
  });

  it("password fields carry no dot placeholder on either variant", () => {
    for (const next of [undefined, "/"]) {
      const { unmount } = render(<AuthScreen initialMode="register" redirectTo={next} />);
      expect(screen.getByLabelText("Password").getAttribute("placeholder")).toBe("");
      expect(screen.getByLabelText("Confirm Password").getAttribute("placeholder")).toBe("");
      unmount();
    }
  });
});
