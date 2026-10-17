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
