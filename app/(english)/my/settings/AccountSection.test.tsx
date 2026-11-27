import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountSection } from "./AccountSection";
import { settingsCopy } from "./settingsCopy";

const account = (email: string | null, username: string | null = null) => ({ email, username, isEditor: false, unreadMessages: 0 });

describe("AccountSection on /my/settings (SHELL-039)", () => {
  it("renders the sign-out form: POST to /auth/sign-out with next=/", () => {
    const html = renderToStaticMarkup(<AccountSection account={account("gleb@example.com")} labels={settingsCopy.en.account} />);
    const form = html.match(/<form [^>]*>/)?.[0] ?? "";
    expect(form).toContain('action="/auth/sign-out"');
    expect(form).toContain('method="post"');
    expect(html).toContain('<input type="hidden" name="next" value="/"/>');
    expect(html).toContain("Sign out");
    expect(html).toContain("Signed in as");
    expect(html).toContain("gleb@example.com");
  });

  it("names a Telegram account by @username, and falls back with neither", () => {
    expect(renderToStaticMarkup(<AccountSection account={account(null, "probe")} labels={settingsCopy.en.account} />)).toContain("@probe");
    const none = renderToStaticMarkup(<AccountSection account={account(null)} labels={settingsCopy.en.account} />);
    expect(none).toContain("You are signed in");
    expect(none).not.toContain("Signed in as");
  });

  it("speaks Russian", () => {
    const html = renderToStaticMarkup(<AccountSection account={account("a@b.c")} labels={settingsCopy.ru.account} />);
    expect(html).toContain("Аккаунт");
    expect(html).toContain("Вы вошли как");
    expect(html).toContain("Выйти");
  });
});
