/**
 * Smoke spec for the phone engines (OPS-045): the free lesson signed out and the
 * notebook signed in, each at 360px with `scrollWidth/innerWidth` printed. An
 * expected text guards against an empty page or a login bounce passing as "no
 * overflow" (CLAUDE.md: a check that passes on an empty result is a failure).
 */

import { expect, test, type Page } from "@playwright/test";
import { PHONE_WIDTH } from "../playwright.config";
import { storageStatePath } from "./fixtures";

const FREE_LESSON = "/courses/future-imperfect/true-or-false";

async function measure(page: Page, label: string) {
  const m = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    coarse: matchMedia("(pointer: coarse)").matches,
    hoverNone: matchMedia("(hover: none)").matches,
    maxTouchPoints: navigator.maxTouchPoints,
    ontouchstart: "ontouchstart" in window,
  }));
  console.log(
    `[${test.info().project.name}] ${label}: scrollWidth/innerWidth ${m.scrollWidth}/${m.innerWidth} ` +
      `(pointer:coarse ${m.coarse}, hover:none ${m.hoverNone}, maxTouchPoints ${m.maxTouchPoints}, ontouchstart ${m.ontouchstart})`,
  );
  // Compared with 360, not with innerWidth: in chromium-pixel (isMobile) an
  // overflowing page widens the layout viewport, so innerWidth grows with it
  // (a 400px element printed 401/401; docs/decisions/0247 Decision 3).
  expect(m.scrollWidth, `${label} scrolls sideways`).toBeLessThanOrEqual(PHONE_WIDTH);
  expect(m.innerWidth, `${label}: the layout viewport widened past ${PHONE_WIDTH}`).toBe(PHONE_WIDTH);
}

test.describe("signed out", () => {
  test("free lesson fits 360", async ({ page }) => {
    const res = await page.goto(FREE_LESSON, { waitUntil: "networkidle" });
    expect(res?.ok()).toBe(true);
    expect(new URL(page.url()).pathname).toBe(FREE_LESSON);
    await expect(page.getByText(/Exercise 1 of/).first()).toBeVisible();
    await measure(page, FREE_LESSON);
  });
});

test.describe("signed in as prog007-learner", () => {
  test.use({ storageState: storageStatePath("prog007") });

  test("notebook fits 360", async ({ page }) => {
    const res = await page.goto("/my/notebook", { waitUntil: "networkidle" });
    expect(res?.ok()).toBe(true);
    expect(new URL(page.url()).pathname).toBe("/my/notebook");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Notebook|Блокнот/);
    await measure(page, "/my/notebook");
  });
});
