import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MyTabs, type MyTab } from "./MyTabs";

const render = (current: MyTab, lang: "en" | "ru", show: boolean, unread = 0) =>
  renderToStaticMarkup(<MyTabs current={current} lang={lang} messages={{ show, unread }} />);
const links = (html: string) => [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g)].map((m) => [m[1], m[2]]);
/** The href of the one link carrying aria-current="page" (attribute order is React's, not ours). */
const current = (html: string) => html.match(/<a [^>]*aria-current="page"[^>]*>/)?.[0].match(/href="([^"]+)"/)?.[1];

describe("MyTabs (SHELL-039)", () => {
  it("marks only the current tab with aria-current=page", () => {
    const html = render("notebook", "en", true);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(current(html)).toBe("/my/notebook");
  });

  it("hides Messages for a learner with no thread and no unread reply", () => {
    expect(links(render("overview", "en", false))).toEqual([
      ["/my", "Overview"],
      ["/my/notebook", "Notebook"],
      ["/my/settings", "Settings"],
    ]);
  });

  it("shows Messages when there is a thread", () => {
    expect(links(render("settings", "en", true)).map(([h]) => h)).toEqual(["/my", "/my/notebook", "/my/messages", "/my/settings"]);
  });

  it("shows Messages on the Messages pages even with no thread", () => {
    const html = render("messages", "en", false);
    expect(current(html)).toBe("/my/messages");
  });

  it("shows Messages with an unread count even when the thread read failed", () => {
    expect(links(render("overview", "en", false, 2))).toContainEqual(["/my/messages", "Messages (2)"]);
  });

  it("speaks Russian", () => {
    const html = render("overview", "ru", true, 2);
    expect(html).toContain('aria-label="Кабинет"');
    expect(links(html).map(([, l]) => l)).toEqual(["Обзор", "Блокнот", "Сообщения (2)", "Настройки"]);
  });

  it("names the nav in English", () => {
    expect(render("overview", "en", true)).toContain('aria-label="My learning"');
  });
});
