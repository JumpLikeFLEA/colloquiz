/**
 * Signs a local-stack fixture account in through the real /login form, and
 * fails fast with the form's own answer when the account is missing
 * (OPS-042, docs/decisions/0245 Decision 3). Shared by the budget guard
 * (scripts/budget.ts) and the phone-engine e2e setup (e2e/auth.setup.ts,
 * OPS-045, docs/decisions/0247).
 */

import type { Page } from "@playwright/test";

/** scripts/seed-local-fixtures.ts's PASSWORD: local-stack fixtures only. */
export const FIXTURE_PASSWORD = "password123!";

/**
 * Fills /login on `page` and waits for whichever comes first: leaving /login,
 * or the form's error box (AuthScreen's `bg-destructive-subtle` <p>). A fixture
 * that doesn't exist on the server's project answers "Invalid login
 * credentials" at once; waiting on the URL alone sat out the full timeout.
 * `missingHint` is appended to the thrown message (where it is missing, how to fix it).
 */
export async function signInThroughForm(page: Page, origin: string, email: string, missingHint: string): Promise<void> {
  await page.goto(`${origin}/login`, { waitUntil: "networkidle", timeout: 15_000 });
  await page.fill("#email", email);
  await page.fill("#password", FIXTURE_PASSWORD);
  const errorBox = page.locator("form p.bg-destructive-subtle");
  await page.click("button[type=submit]");
  const outcome = await Promise.race([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15_000 }).then(() => "signed-in" as const),
    errorBox.waitFor({ state: "visible", timeout: 15_000 }).then(() => "refused" as const),
  ]);
  if (outcome === "refused") {
    const message = ((await errorBox.textContent()) ?? "").trim();
    throw new Error(`the login form answered "${message}": fixture ${email} ${missingHint}`);
  }
}
