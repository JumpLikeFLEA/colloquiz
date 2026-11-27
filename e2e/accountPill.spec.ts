/**
 * SHELL-040 (docs/decisions/0252): the account pill is one tap into /my, the
 * personal area's tabs reach Notebook and Settings, and Sign out on Settings
 * lands on / signed out. Both phone engines at 360px with touch.
 *
 * Signs in through the real login form as play006-signedin, in this spec's own
 * context, and not as one of the shared FIXTURES: sign-out's default scope ends
 * every session of that user (app/auth/sign-out/route.ts), which would spoil
 * a stored state another spec reuses later in the run.
 */

import { expect, test, type Page } from "@playwright/test";
import { PHONE_WIDTH } from "../playwright.config";
import { signInThroughForm } from "../scripts/fixtureSignIn";
import { SEED_HINT } from "../scripts/localServer";
import { headerSlack } from "./headerSlack";

const LEARNER = "play006-signedin@example.com";
const COURSE = "/courses/future-imperfect";

test.use({ storageState: { cookies: [], origins: [] } });

async function measure(page: Page, label: string) {
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  console.log(`[${test.info().project.name}] ${label}: scrollWidth/innerWidth ${m.sw}/${m.iw}`);
  expect(m.sw, `${label} scrolls sideways`).toBeLessThanOrEqual(PHONE_WIDTH);
}

/**
 * Every item in the top bar has at least 8px to spare on its row (0252). Not
 * `scrollWidth <= clientWidth`: that passed while the landing's wordmark wrapped.
 */
const MIN_SLACK = 8;
async function barFits(page: Page, label: string) {
  const rows = await headerSlack(page);
  expect(rows.length, `${label}: nothing measured in the header`).toBeGreaterThan(0);
  for (const r of rows) {
    console.log(`[${test.info().project.name}] ${label} row ${r.row} ${r.items}: need ${r.need} / box ${r.box}, slack ${r.slack}`);
  }
  for (const r of rows) expect(r.slack, `${label} row ${r.row} (${r.items})`).toBeGreaterThanOrEqual(MIN_SLACK);
}

test("pill → /my → Notebook → Settings → Sign out → / signed out", async ({ page, baseURL }) => {
  await signInThroughForm(page, baseURL ?? "", LEARNER, `is missing on ${baseURL}: ${SEED_HINT}`);

  for (const lang of ["en", "ru"]) {
    await page.context().addCookies([{ name: "colloquiz_landing_lang", value: lang, url: baseURL ?? "" }]);
    await page.goto("/");
    await barFits(page, `landing signed in ${lang}`);
    await page.goto(COURSE);
    await barFits(page, `course page ${lang}`);
  }
  await page.context().addCookies([{ name: "colloquiz_landing_lang", value: "en", url: baseURL ?? "" }]);

  await page.goto(COURSE);
  const pill = page.getByRole("link", { name: /^My learning/ });
  await expect(pill).toBeVisible();
  await expect(pill).toHaveAttribute("href", "/my");
  await measure(page, "course page with the pill");

  await pill.tap();
  await page.waitForURL((u) => u.pathname === "/my");
  await expect(page.getByRole("link", { name: /^My learning/ })).toHaveAttribute("aria-current", "page");

  const tabs = page.getByRole("navigation", { name: "My learning" });
  await tabs.getByRole("link", { name: "Notebook" }).tap();
  await page.waitForURL((u) => u.pathname === "/my/notebook");
  await expect(tabs.getByRole("link", { name: "Notebook" })).toHaveAttribute("aria-current", "page");

  await tabs.getByRole("link", { name: "Settings" }).tap();
  await page.waitForURL((u) => u.pathname === "/my/settings");
  await measure(page, "/my/settings");

  await page.getByRole("button", { name: "Sign out" }).tap();
  await page.waitForURL((u) => u.pathname === "/");
  await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^My learning/ })).toHaveCount(0);
  for (const lang of ["en", "ru"]) {
    await page.context().addCookies([{ name: "colloquiz_landing_lang", value: lang, url: baseURL ?? "" }]);
    await page.goto("/");
    await barFits(page, `landing signed out ${lang}`);
  }
});
