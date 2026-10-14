import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UserIdentity } from "@supabase/supabase-js";
import { ProvidersSection } from "./ProvidersSection";

/**
 * ANON-012 (docs/decisions/0139) — the Telegram row: the minimum linking path
 * docs/decisions/0098 Decision 2 recommended. A Telegram identity sends no
 * email, so the row names its @username instead.
 */

const linkIdentity = vi.fn().mockResolvedValue({ error: null });

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { linkIdentity } }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

function identity(provider: string, identity_data: Record<string, unknown>): UserIdentity {
  return {
    id: `${provider}-id`,
    identity_id: `${provider}-identity`,
    user_id: "u1",
    provider,
    identity_data,
    created_at: "2026-10-14T00:00:00Z",
    last_sign_in_at: "2026-10-14T00:00:00Z",
    updated_at: "2026-10-14T00:00:00Z",
  } as UserIdentity;
}

function telegramRow(): HTMLElement {
  return screen.getByText("Telegram").closest("div.flex.items-center") as HTMLElement;
}

afterEach(() => {
  cleanup();
  linkIdentity.mockClear();
});

describe("ProvidersSection — Telegram", () => {
  it("a connected Telegram identity shows its @username, as Telegram sends no email", () => {
    render(
      <ProvidersSection
        identities={[identity("email", { email: "a@example.com" }), identity("custom:telegram", { preferred_username: "likeflea" })]}
        loadError={null}
      />,
    );
    expect(within(telegramRow()).getByText(/Connected · @likeflea/)).toBeDefined();
    expect(within(telegramRow()).getByRole("button", { name: /Disconnect/ })).toBeDefined();
  });

  it("Connect links Telegram through the custom provider and returns to Settings", async () => {
    render(<ProvidersSection identities={[identity("email", { email: "a@example.com" })]} loadError={null} />);
    expect(within(telegramRow()).getByText("Not connected")).toBeDefined();
    fireEvent.click(within(telegramRow()).getByRole("button", { name: /Connect/ }));
    await waitFor(() => expect(linkIdentity).toHaveBeenCalledTimes(1));
    const args = linkIdentity.mock.calls[0][0];
    expect(args.provider).toBe("custom:telegram");
    expect(new URL(args.options.redirectTo as string).pathname).toBe("/auth/callback");
    expect(new URL(args.options.redirectTo as string).searchParams.get("next")).toBe("/app/settings");
  });

  it("a Telegram-only account can't disconnect its one sign-in method", () => {
    render(<ProvidersSection identities={[identity("custom:telegram", { preferred_username: "likeflea" })]} loadError={null} />);
    const disconnect = within(telegramRow()).getByRole("button", { name: /Disconnect/ }) as HTMLButtonElement;
    expect(disconnect.disabled).toBe(true);
  });
});
