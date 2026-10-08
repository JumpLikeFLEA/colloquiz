import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { alliengllCopy } from "@/lib/alliengll/copy";
import { ATTEMPT_STORAGE_KEY } from "@/lib/lessonPlayer/attemptStore";
import { RegistrationOffer } from "./RegistrationOffer";

/**
 * ANON-004 — covers the parts of the offer that don't need a real Supabase
 * round trip: the collapse/expand/dismiss states, the in-app-browser OAuth
 * hide (docs/decisions/0068 Decision 7), and that opening the form with
 * pre-existing local attempts stashes them via POST /api/pending-claims
 * before signUp is called. The signUp/OAuth calls themselves are covered by
 * `lib/pendingClaims.test.ts` (the endpoint's own pure helpers) and
 * `lib/lessonPlayer/attemptStore.test.ts` (the payload shape) — this file
 * only proves `RegistrationOffer` wires into those contracts correctly.
 */

const signUp = vi.fn().mockResolvedValue({ error: null });
const signInWithOAuth = vi.fn().mockResolvedValue({ error: null });

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signUp, signInWithOAuth } }),
}));

function setUserAgent(value: string) {
  Object.defineProperty(window.navigator, "userAgent", { value, configurable: true });
}

beforeEach(() => {
  setUserAgent(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  );
});

afterEach(() => {
  cleanup();
  signUp.mockClear();
  signInWithOAuth.mockClear();
  window.localStorage.removeItem(ATTEMPT_STORAGE_KEY);
  vi.unstubAllGlobals();
});

describe("RegistrationOffer", () => {
  it("renders the collapsed offer with a CTA and a dismiss control", () => {
    render(<RegistrationOffer lessonPath="/courses/c/l" />);
    expect(screen.getByText(alliengllCopy.signupOffer.title)).toBeDefined();
    expect(screen.getByRole("button", { name: alliengllCopy.signupOffer.cta })).toBeDefined();
    expect(screen.getByRole("button", { name: alliengllCopy.signupOffer.dismiss })).toBeDefined();
  });

  it("dismissing renders nothing further", () => {
    render(<RegistrationOffer lessonPath="/courses/c/l" />);
    fireEvent.click(screen.getByRole("button", { name: alliengllCopy.signupOffer.dismiss }));
    expect(screen.queryByText(alliengllCopy.signupOffer.title)).toBeNull();
  });

  it("expanding shows OAuth buttons and the email/password form on an ordinary browser", () => {
    render(<RegistrationOffer lessonPath="/courses/c/l" />);
    fireEvent.click(screen.getByRole("button", { name: alliengllCopy.signupOffer.cta }));
    expect(screen.getByText(alliengllCopy.signupOffer.oauthGoogle)).toBeDefined();
    expect(screen.getByText(alliengllCopy.signupOffer.oauthDiscord)).toBeDefined();
    expect(screen.getByLabelText(alliengllCopy.signupOffer.emailLabel)).toBeDefined();
  });

  it("hides OAuth buttons and shows a notice inside a detected in-app browser", () => {
    setUserAgent("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Instagram 302.0.0.23.114");
    render(<RegistrationOffer lessonPath="/courses/c/l" />);
    fireEvent.click(screen.getByRole("button", { name: alliengllCopy.signupOffer.cta }));
    expect(screen.queryByText(alliengllCopy.signupOffer.oauthGoogle)).toBeNull();
    expect(screen.getByText(alliengllCopy.signupOffer.inAppBrowserNotice)).toBeDefined();
    // The email/password form is still available.
    expect(screen.getByLabelText(alliengllCopy.signupOffer.emailLabel)).toBeDefined();
  });

  it("stashes pre-existing local attempts through POST /api/pending-claims before signUp, and threads the token into emailRedirectTo", async () => {
    window.localStorage.setItem(
      ATTEMPT_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        attempts: [
          {
            attemptId: "a1",
            lessonVersionId: "v1",
            blockId: "b1",
            earned: 1,
            possible: 1,
            recordedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    );
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: "claim-token-123", expiresAt: "2026-01-08T00:00:00.000Z" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<RegistrationOffer lessonPath="/courses/c/l" />);
    fireEvent.click(screen.getByRole("button", { name: alliengllCopy.signupOffer.cta }));
    fireEvent.change(screen.getByLabelText(alliengllCopy.signupOffer.emailLabel), {
      target: { value: "learner@example.com" },
    });
    fireEvent.change(screen.getByLabelText(alliengllCopy.signupOffer.passwordLabel), {
      target: { value: "correct horse battery staple" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: alliengllCopy.signupOffer.submit }));

    await vi.waitFor(() => expect(signUp).toHaveBeenCalledTimes(1));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/pending-claims",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          attempts: [{ attempt_id: "a1", lesson_version_id: "v1", block_id: "b1", earned: 1, possible: 1 }],
        }),
      }),
    );

    const callArgs = signUp.mock.calls[0][0] as { options: { emailRedirectTo: string } };
    const redirectUrl = new URL(callArgs.options.emailRedirectTo);
    expect(redirectUrl.pathname).toBe("/auth/confirm");
    expect(redirectUrl.searchParams.get("next")).toBe("/courses/c/l");
    expect(redirectUrl.searchParams.get("claim")).toBe("claim-token-123");
  });

  it("does not call /api/pending-claims when there are no local attempts to migrate", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<RegistrationOffer lessonPath="/courses/c/l" />);
    fireEvent.click(screen.getByRole("button", { name: alliengllCopy.signupOffer.cta }));
    fireEvent.change(screen.getByLabelText(alliengllCopy.signupOffer.emailLabel), {
      target: { value: "learner@example.com" },
    });
    fireEvent.change(screen.getByLabelText(alliengllCopy.signupOffer.passwordLabel), {
      target: { value: "correct horse battery staple" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: alliengllCopy.signupOffer.submit }));

    await vi.waitFor(() => expect(signUp).toHaveBeenCalledTimes(1));
    expect(fetchMock).not.toHaveBeenCalled();
    const callArgs = signUp.mock.calls[0][0] as { options: { emailRedirectTo: string } };
    expect(new URL(callArgs.options.emailRedirectTo).searchParams.get("claim")).toBeNull();
  });

  it("requires the consent checkbox before submitting (JS-level check, belt-and-braces over the checkbox's own `required`)", async () => {
    render(<RegistrationOffer lessonPath="/courses/c/l" />);
    fireEvent.click(screen.getByRole("button", { name: alliengllCopy.signupOffer.cta }));
    fireEvent.change(screen.getByLabelText(alliengllCopy.signupOffer.emailLabel), {
      target: { value: "learner@example.com" },
    });
    fireEvent.change(screen.getByLabelText(alliengllCopy.signupOffer.passwordLabel), {
      target: { value: "correct horse battery staple" },
    });
    // Bypasses the checkbox's native `required` (which jsdom's own submit-time
    // constraint validation would otherwise enforce before any JS runs) by
    // submitting the form directly, to prove the JS-level check independently.
    fireEvent.submit(screen.getByRole("button", { name: alliengllCopy.signupOffer.submit }).closest("form")!);

    expect(await screen.findByText(alliengllCopy.signupOffer.consentRequired)).toBeDefined();
    expect(signUp).not.toHaveBeenCalled();
  });

  describe("ANON-015 — browser storage blocked", () => {
    // Chrome-style blocked storage: reading the `localStorage` /
    // `sessionStorage` property itself throws, before any getItem/setItem.
    // The most hostile mode — a getItem/setItem-only throw is covered at the
    // lib layer (funnelSource.test.ts, attemptStore.test.ts).
    function blockStorage() {
      const blocked = () => {
        throw new DOMException("The operation is insecure.", "SecurityError");
      };
      vi.spyOn(window, "localStorage", "get").mockImplementation(blocked);
      vi.spyOn(window, "sessionStorage", "get").mockImplementation(blocked);
    }

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("still reaches signUp, with no source and no claim, when storage access throws", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      blockStorage();

      render(<RegistrationOffer lessonPath="/courses/c/l" />);
      fireEvent.click(screen.getByRole("button", { name: alliengllCopy.signupOffer.cta }));
      fireEvent.change(screen.getByLabelText(alliengllCopy.signupOffer.emailLabel), {
        target: { value: "learner@example.com" },
      });
      fireEvent.change(screen.getByLabelText(alliengllCopy.signupOffer.passwordLabel), {
        target: { value: "correct horse battery staple" },
      });
      fireEvent.click(screen.getByRole("checkbox"));
      fireEvent.click(screen.getByRole("button", { name: alliengllCopy.signupOffer.submit }));

      await vi.waitFor(() => expect(signUp).toHaveBeenCalledTimes(1));
      expect(screen.queryByText(alliengllCopy.signupOffer.genericError)).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
      const callArgs = signUp.mock.calls[0][0] as { options: { emailRedirectTo: string } };
      const redirectUrl = new URL(callArgs.options.emailRedirectTo);
      expect(redirectUrl.searchParams.get("next")).toBe("/courses/c/l");
      expect(redirectUrl.searchParams.get("source")).toBeNull();
      expect(redirectUrl.searchParams.get("claim")).toBeNull();
    });

    it("still reaches signInWithOAuth, with no source, when storage access throws", async () => {
      blockStorage();

      render(<RegistrationOffer lessonPath="/courses/c/l" />);
      fireEvent.click(screen.getByRole("button", { name: alliengllCopy.signupOffer.cta }));
      fireEvent.click(screen.getByRole("button", { name: alliengllCopy.signupOffer.oauthGoogle }));

      await vi.waitFor(() => expect(signInWithOAuth).toHaveBeenCalledTimes(1));
      expect(screen.queryByText(alliengllCopy.signupOffer.genericError)).toBeNull();
      const callArgs = signInWithOAuth.mock.calls[0][0] as { options: { redirectTo: string } };
      const redirectUrl = new URL(callArgs.options.redirectTo);
      expect(redirectUrl.pathname).toBe("/auth/callback");
      expect(redirectUrl.searchParams.get("next")).toBe("/courses/c/l");
      expect(redirectUrl.searchParams.get("source")).toBeNull();
    });
  });
});

describe("RegistrationOffer — sign-in entry (ANON-016)", () => {
  const href = `/login?next=${encodeURIComponent("/courses/c/l")}`;

  it("links existing accounts to /login with the lesson path, collapsed and expanded", () => {
    render(<RegistrationOffer lessonPath="/courses/c/l" />);
    expect(screen.getByRole("link", { name: alliengllCopy.signupOffer.signIn }).getAttribute("href")).toBe(href);
    fireEvent.click(screen.getByRole("button", { name: alliengllCopy.signupOffer.cta }));
    expect(screen.getByRole("link", { name: alliengllCopy.signupOffer.signIn }).getAttribute("href")).toBe(href);
  });
});
