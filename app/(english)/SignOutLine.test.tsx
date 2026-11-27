import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { invitePath } from "@/lib/runInvites";
import { joinPath } from "@/lib/teacherLinks";
import { inviteCopy } from "./invite/[token]/inviteCopy";
import { joinCopy } from "./join/[token]/joinCopy";
import { SignOutLine } from "./SignOutLine";

const TOKEN = "b".repeat(32);
const form = (html: string) => {
  document.body.innerHTML = html;
  return document.body.querySelector("form") as HTMLFormElement;
};

describe("SignOutLine (SHELL-040)", () => {
  it.each([
    ["invite", inviteCopy.pending.otherAccount, invitePath(TOKEN)],
    ["join EN", joinCopy.en.otherAccount, joinPath(TOKEN)],
    ["join RU", joinCopy.ru.otherAccount, joinPath(TOKEN)],
  ])("%s: posts to /auth/sign-out with next = the same page", (_name, copy, path) => {
    const f = form(renderToStaticMarkup(<SignOutLine copy={copy} next={path} />));
    expect(f.getAttribute("method")).toBe("post");
    expect(f.getAttribute("action")).toBe("/auth/sign-out");
    expect((f.querySelector('input[name="next"]') as HTMLInputElement).value).toBe(path);
    expect(f.querySelector('button[type="submit"]')?.textContent).toBe(copy.signOut);
    expect(f.textContent).toBe(`${copy.before} ${copy.signOut} ${copy.after}`);
  });

  it("no longer points at a menu", () => {
    for (const c of [inviteCopy.pending.otherAccount, joinCopy.en.otherAccount, joinCopy.ru.otherAccount]) {
      expect(`${c.before} ${c.after}`).not.toMatch(/menu|меню/i);
    }
  });
});
