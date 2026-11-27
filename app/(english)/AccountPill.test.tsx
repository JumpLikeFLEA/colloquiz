import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountPill } from "./AccountPill";

const account = (props: { email: string | null; username?: string | null; isEditor?: boolean; unreadMessages?: number }) => ({
  username: null,
  isEditor: false,
  unreadMessages: 0,
  ...props,
});
const render = (
  props: { email: string | null; username?: string | null; unreadMessages?: number },
  lang: "en" | "ru" = "en",
  current = false,
) => renderToStaticMarkup(<AccountPill account={account(props)} lang={lang} current={current} />);
const root = (html: string) => {
  document.body.innerHTML = html;
  return document.body.firstElementChild as HTMLAnchorElement;
};

describe("AccountPill (SHELL-040)", () => {
  it("is one link to /my with the label, and nothing else to open", () => {
    const html = render({ email: "gleb@example.com" });
    const a = root(html);
    expect(a.tagName).toBe("A");
    expect(a.getAttribute("href")).toBe("/my");
    expect(a.textContent).toContain("My learning");
    expect(html).not.toContain("<details");
    expect(html).not.toContain("<form");
    expect(document.body.querySelectorAll("a")).toHaveLength(1);
  });

  it("reads Кабинет in Russian", () => {
    const a = root(render({ email: "gleb@example.com" }, "ru"));
    expect(a.textContent).toContain("Кабинет");
    expect(a.getAttribute("aria-label")).toBe("Кабинет");
    expect(a.getAttribute("title")).toBe("Вы вошли как gleb@example.com");
  });

  it("names the account in the tooltip: email, else @username, else the generic line", () => {
    expect(root(render({ email: "gleb@example.com", username: "ignored" })).getAttribute("title")).toBe(
      "Signed in as gleb@example.com",
    );
    const tg = root(render({ email: null, username: "probe_user" }));
    expect(tg.getAttribute("title")).toBe("Signed in as @probe_user");
    expect(tg.textContent).toContain("P");
    const none = root(render({ email: null, username: null }));
    expect(none.getAttribute("title")).toBe("You are signed in");
    expect(none.querySelector("svg")).not.toBeNull();
  });

  it("shows the initial, upper-cased", () => {
    expect(render({ email: "gleb@example.com" })).toContain(">G<");
  });

  it("carries the unread dot and count in its name only while a reply is unread", () => {
    const read = root(render({ email: "gleb@example.com" }));
    expect(read.getAttribute("aria-label")).toBe("My learning");
    expect(read.querySelector("[data-unread-dot]")).toBeNull();
    const unread = root(render({ email: "gleb@example.com", unreadMessages: 2 }));
    expect(unread.getAttribute("aria-label")).toBe("My learning. Unread messages: 2");
    expect(unread.querySelector("[data-unread-dot]")).not.toBeNull();
    expect(root(render({ email: "g@x.com", unreadMessages: 3 }, "ru")).getAttribute("aria-label")).toBe(
      "Кабинет. Непрочитанные сообщения: 3",
    );
  });

  it("is aria-current only on /my", () => {
    expect(root(render({ email: "g@x.com" })).hasAttribute("aria-current")).toBe(false);
    expect(root(render({ email: "g@x.com" }, "en", true)).getAttribute("aria-current")).toBe("page");
  });

  it("keeps the bar's 44px row height (min-h-11) and links nowhere under /app", () => {
    const html = render({ email: "g@x.com" });
    expect(root(html).className).toContain("min-h-11");
    expect(html).not.toContain('href="/app');
  });
});
