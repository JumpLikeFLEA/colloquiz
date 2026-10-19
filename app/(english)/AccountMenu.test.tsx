import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountMenu } from "./AccountMenu";

const render = (props: { email: string | null; username?: string | null }) =>
  renderToStaticMarkup(<AccountMenu {...props} lang="en" next="/" studio={false} />);

describe("AccountMenu (SHELL-024)", () => {
  it("names a Telegram account by its username: first letter on the chip, @name in the card", () => {
    const html = render({ email: null, username: "probe_user" });
    expect(html).toContain(">P</span>");
    expect(html).toContain(">@probe_user</span>");
    expect(html).toContain("Signed in as @probe_user");
  });

  it("leaves an email account unchanged, even if a username is passed", () => {
    const html = render({ email: "gleb@example.com", username: "ignored" });
    expect(html).toContain(">G</span>");
    expect(html).toContain("Signed in as gleb@example.com");
    expect(html).not.toContain("@ignored");
  });

  it("falls back to the icon and the generic line with neither", () => {
    const html = render({ email: null, username: null });
    expect(html).toContain("You are signed in");
    expect(html).not.toContain("Signed in as");
  });
});

describe("AccountMenu Settings link (docs/decisions/0181)", () => {
  const menu = (lang: "en" | "ru", studio: boolean) =>
    renderToStaticMarkup(<AccountMenu email="gleb@example.com" lang={lang} next="/" studio={studio} />);

  it("links every signed-in user to /my/settings, never to /app/settings", () => {
    const html = menu("en", false);
    expect(html).toContain('href="/my/settings"');
    expect(html).toContain("Settings");
    expect(html).not.toContain('href="/app');
  });

  it("puts it after Studio and before Sign out", () => {
    const html = menu("en", true);
    const studio = html.indexOf('href="/studio"');
    const settings = html.indexOf('href="/my/settings"');
    const signOut = html.indexOf('action="/auth/sign-out"');
    expect(studio).toBeGreaterThan(-1);
    expect(settings).toBeGreaterThan(studio);
    expect(signOut).toBeGreaterThan(settings);
  });

  it("reads Настройки in Russian", () => {
    expect(menu("ru", false)).toContain("Настройки");
  });
});
