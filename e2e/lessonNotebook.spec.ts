/**
 * PROG-022 (docs/decisions/0248): "Add a phrase" from inside a lesson, in both phone engines at
 * 360px with touch, signed in as prog002-learner (docs/decisions/0246 Decision 6: a pass is
 * evidence about the engines, not about a phone).
 *
 * Every note this spec adds has a phrase starting with PREFIX, and afterAll deletes them (and the
 * notes the cap test seeds) with the local stack's service key, which `npm run e2e` puts in this
 * process's env (scripts/localServer.ts, applyLocalStackEnv).
 */

import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { PHONE_WIDTH } from "../playwright.config";
import { FIXTURES, storageStatePath } from "./fixtures";
import { readCaptures, touchDrag, watchCaptures } from "./touchDrag";

const FREE_LESSON = "/courses/future-imperfect/true-or-false";
const THEORY_LESSON = "/courses/play-006-smoke/theory-lesson";
const GAPS_LESSON = "/courses/play-006-smoke/gaps-lesson";
const DRAG_LESSON = "/courses/future-imperfect/applied-practice";
const PREFIX = "e2e-prog022";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error(`the cleanup needs the local stack's URL and service key in the env (got ${url ?? "no URL"})`);
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function learnerId(): Promise<string> {
  const { data, error } = await admin().auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const user = data.users.find((u) => u.email === FIXTURES.prog002);
  if (!user) throw new Error(`${FIXTURES.prog002} is missing`);
  return user.id;
}

async function deleteSpecNotes() {
  const { error, count } = await admin()
    .from("notebook_entries")
    .delete({ count: "exact" })
    .eq("user_id", await learnerId())
    .eq("kind", "own")
    .like("phrase", `${PREFIX}%`);
  if (error) throw error;
  return count ?? 0;
}

/** scrollWidth/innerWidth at 360, printed (the smoke spec's rule, docs/decisions/0247 Decision 3). */
async function measure(page: Page, label: string) {
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  console.log(`[${test.info().project.name}] ${label}: scrollWidth/innerWidth ${m.sw}/${m.iw}`);
  expect(m.sw, `${label} scrolls sideways`).toBeLessThanOrEqual(PHONE_WIDTH);
  expect(m.iw, `${label}: the layout viewport widened past ${PHONE_WIDTH}`).toBe(PHONE_WIDTH);
}

const button = (page: Page) => page.getByRole("button", { name: "Add a phrase" });
const dialog = (page: Page) => page.getByRole("dialog", { name: "Add a phrase" });
const added = (page: Page) => page.getByRole("status").filter({ hasText: "Added to your notebook" });

async function openDialog(page: Page) {
  await button(page).tap();
  await expect(dialog(page)).toBeVisible();
  // The box is measured after the open animation (zoom-in-95) has finished.
  await dialog(page).evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  const box = await dialog(page).boundingBox();
  // Pinned to the top (top-4), not centred: an on-screen keyboard covers the bottom.
  expect(box?.y ?? Infinity, "the dialog is pinned to the top").toBeLessThanOrEqual(20);
}

/** A unique phrase for this project and run. */
function phrase(what: string) {
  return `${PREFIX} ${what} ${test.info().project.name} ${Date.now()}`;
}

async function savePhrase(page: Page, text: string, note = "") {
  await dialog(page).getByLabel("Phrase", { exact: true }).fill(text);
  if (note) await dialog(page).getByLabel("Note (optional)").fill(note);
  await dialog(page).getByRole("button", { name: "Save" }).tap();
  await expect(added(page)).toBeVisible();
}

test.afterAll(async () => {
  console.log(`cleanup: deleted ${await deleteSpecNotes()} spec notes`);
});

test.describe("signed out", () => {
  test("the free lesson has no button (the signed-in tests below are the control)", async ({ page }) => {
    await page.goto(FREE_LESSON, { waitUntil: "networkidle" });
    await expect(page.getByRole("progressbar")).toBeVisible();
    await expect(button(page)).toHaveCount(0);
    await measure(page, `${FREE_LESSON} signed out`);
  });
});

test.describe("signed in as prog002-learner", () => {
  test.use({ storageState: storageStatePath("prog002") });

  test("adds a phrase from the free lesson and finds it in the notebook through the link", async ({ page }) => {
    await page.goto(FREE_LESSON, { waitUntil: "networkidle" });
    await expect(page.getByRole("progressbar")).toBeVisible();
    await expect(button(page)).toBeVisible();
    await measure(page, `${FREE_LESSON} strip with the button`);

    await openDialog(page);
    await expect(dialog(page).getByText(/^From: .+ · .+$/)).toBeVisible();
    await measure(page, `${FREE_LESSON} dialog open`);

    const text = phrase("free");
    await savePhrase(page, text, "from the free lesson");
    await expect(added(page)).toBeFocused();
    await measure(page, `${FREE_LESSON} added`);

    // Client navigation through the success link, so a stale router cache would show up.
    const link = dialog(page).getByRole("link", { name: "Open your notebook" });
    const href = await link.getAttribute("href");
    expect(href).toMatch(/^\/my\/notebook\?course=[0-9a-f-]{36}$/);
    await link.tap();
    await expect(page).toHaveURL(new RegExp(`${href!.replace(/[?]/g, "\\?")}$`));
    await expect(page.getByText(text)).toBeVisible();
  });

  test("adds a phrase from a lesson with no exercises", async ({ page }) => {
    await page.goto(THEORY_LESSON, { waitUntil: "networkidle" });
    await expect(page.getByText("Keep the phrase on second thought for later.")).toBeVisible();
    // Back link and button, no bar and no count (0246 Decision 3).
    await expect(button(page)).toBeVisible();
    await expect(page.getByRole("progressbar")).toHaveCount(0);
    await measure(page, `${THEORY_LESSON} strip without exercises`);

    await openDialog(page);
    const text = phrase("theory");
    await savePhrase(page, text);
    const href = await dialog(page).getByRole("link", { name: "Open your notebook" }).getAttribute("href");
    await page.goto(href!, { waitUntil: "networkidle" });
    await expect(page.getByText(text)).toBeVisible();
  });

  test("refusals: empty, too long, the cap, not readable, an expired session", async ({ page, context }) => {
    await page.goto(FREE_LESSON, { waitUntil: "networkidle" });
    await openDialog(page);
    const d = dialog(page);
    const save = d.getByRole("button", { name: "Save" });
    const field = d.getByLabel("Phrase", { exact: true });

    await save.tap();
    await expect(d.getByText("Write a phrase.")).toBeVisible();
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await measure(page, "refusal: empty phrase");

    await field.fill("x".repeat(201));
    await save.tap();
    await expect(d.getByText("The phrase is longer than 200 characters.")).toBeVisible();
    await measure(page, "refusal: phrase too long");

    await field.fill(phrase("long note"));
    await d.getByLabel("Note (optional)").fill("y".repeat(501));
    await save.tap();
    await expect(d.getByText("The note is longer than 500 characters.")).toBeVisible();
    await measure(page, "refusal: note too long");
    await d.getByLabel("Note (optional)").fill("");

    // not_readable: the RPC decides on the lesson id the form sends; point it at a lesson this
    // learner cannot open (a paid lesson with no grant).
    const { data: paid, error: paidErr } = await admin()
      .from("lessons")
      .select("id, courses!inner(slug)")
      .eq("slug", "paid-lesson")
      .eq("courses.slug", "play-006-smoke")
      .single();
    if (paidErr) throw paidErr;
    await field.fill(phrase("not readable"));
    // Set last: a re-render puts React's value back into the hidden field.
    await d.locator('input[name="lessonId"]').evaluate((el, id) => ((el as HTMLInputElement).value = id), paid.id);
    await save.tap();
    await expect(d.getByText("This lesson isn't open to you now, so the phrase wasn't saved.")).toBeVisible();
    await measure(page, "refusal: not_readable");

    // The cap (PT429): fill the learner's own notes up to 1,000, then save one more.
    const userId = await learnerId();
    const { count } = await admin()
      .from("notebook_entries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("kind", "own");
    const rows = Array.from({ length: 1000 - (count ?? 0) }, (_, i) => ({
      user_id: userId,
      kind: "own",
      phrase: `${PREFIX} cap ${i}`,
    }));
    const { error: capErr } = await admin().from("notebook_entries").insert(rows);
    if (capErr) throw capErr;
    try {
      await page.reload({ waitUntil: "networkidle" });
      await openDialog(page);
      await dialog(page).getByLabel("Phrase", { exact: true }).fill(phrase("over the cap"));
      await dialog(page).getByRole("button", { name: "Save" }).tap();
      await expect(dialog(page).getByText(/You have 1,000 notes, which is the limit/)).toBeVisible();
      await measure(page, "refusal: the 1,000-note cap");
    } finally {
      await deleteSpecNotes();
    }

    // An expired session: the cookies go; the typed text stays, with a sign-in link back here.
    await context.clearCookies();
    const kept = phrase("expired");
    await dialog(page).getByLabel("Phrase", { exact: true }).fill(kept);
    await dialog(page).getByLabel("Note (optional)").fill("kept note");
    await dialog(page).getByRole("button", { name: "Save" }).tap();
    await expect(dialog(page).getByText("Your session has ended, so the phrase wasn't saved.")).toBeVisible();
    await expect(dialog(page).getByRole("link", { name: "Sign in again" })).toHaveAttribute(
      "href",
      `/login?next=${encodeURIComponent(FREE_LESSON)}`,
    );
    await expect(dialog(page).getByLabel("Phrase", { exact: true })).toHaveValue(kept);
    await expect(dialog(page).getByLabel("Note (optional)")).toHaveValue("kept note");
    await measure(page, "refusal: expired session");
  });

  test("closes with the X and with Escape, focus back on the button; Add another", async ({ page }) => {
    await page.goto(FREE_LESSON, { waitUntil: "networkidle" });

    await openDialog(page);
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await expect(button(page)).toBeFocused();

    await openDialog(page);
    await dialog(page).getByRole("button", { name: "Close" }).tap();
    await expect(dialog(page)).toHaveCount(0);
    await expect(button(page)).toBeFocused();

    await openDialog(page);
    await savePhrase(page, phrase("first"));
    await dialog(page).getByRole("button", { name: "Add another" }).tap();
    await expect(dialog(page).getByLabel("Phrase", { exact: true })).toHaveValue("");
    await expect(dialog(page).getByLabel("Phrase", { exact: true })).toBeFocused();
    await savePhrase(page, phrase("second"));
    // The success state's own Close (the X has the same name).
    await dialog(page).getByRole("button", { name: "Close" }).first().tap();
    await expect(dialog(page)).toHaveCount(0);
    await expect(button(page)).toBeFocused();
  });

  test("a typed gap keeps its text across a save", async ({ page }) => {
    await page.goto(GAPS_LESSON, { waitUntil: "networkidle" });
    const gap = page.getByLabel("Gap 1", { exact: true });
    await gap.fill("go");
    await openDialog(page);
    await savePhrase(page, phrase("gaps"));
    await dialog(page).getByRole("button", { name: "Close" }).first().tap();
    await expect(dialog(page)).toHaveCount(0);
    await expect(gap).toHaveValue("go");
  });

  test("applied-practice: a drag completes after the dialog was opened and closed, and survives a save", async ({
    page,
    browserName,
  }) => {
    await page.goto(DRAG_LESSON, { waitUntil: "networkidle" });
    const handles = page.getByRole("button", { name: /^Drag to reorder "/ });
    await expect(handles).toHaveCount(4);
    const order = async () => handles.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    const before = await order();

    await openDialog(page);
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);

    const first = handles.first();
    await first.scrollIntoViewIfNeeded();
    // Below the sticky strip (h-12), so the press lands on the handle.
    await page.evaluate(() => window.scrollBy(0, -120));
    let sensor: string;
    if (browserName === "chromium") {
      const a = (await first.boundingBox())!;
      const b = (await handles.nth(2).boundingBox())!;
      const report = await touchDrag(page, browserName, { x: a.x + a.width / 2, y: a.y + a.height / 2 }, b.y - a.y);
      sensor = `touch (${report.method}): ${report.captured.join(", ") || "nothing captured"}`;
    } else {
      // WebKit: a touch drag cannot be driven (docs/decisions/0247); the keyboard path is.
      await watchCaptures(page);
      await first.focus();
      for (const key of ["Space", "ArrowDown", "ArrowDown", "Space"]) {
        await page.keyboard.press(key);
        await page.waitForTimeout(150);
      }
      sensor = `keyboard: ${(await readCaptures(page)).join(", ") || "nothing captured"}; touch drag not tested`;
    }
    console.log(`[${test.info().project.name}] applied-practice drag sensor: ${sensor}`);
    await expect.poll(order).not.toEqual(before);
    if (browserName === "chromium") {
      // Finding (docs/decisions/0248): after a CDP-driven touch drag, the next tap in
      // chromium-pixel fires no click whatever it lands on (the back link was the control);
      // the one after it does. A throwaway tap on the lesson text absorbs it.
      await page.getByText(/^Put these four sentences in order/).first().tap();
    }
    const moved = await order();
    console.log(`[${test.info().project.name}] order before ${JSON.stringify(before)} after ${JSON.stringify(moved)}`);

    await openDialog(page);
    await savePhrase(page, phrase("drag"));
    await dialog(page).getByRole("button", { name: "Close" }).first().tap();
    // Radix hides the page from the accessibility tree while the dialog is open.
    await expect(dialog(page)).toHaveCount(0);
    expect(await order()).toEqual(moved);
  });
});

test.describe("1280", () => {
  test("strip and dialog at 1280 (chromium only)", async ({ browser, browserName }) => {
    test.skip(browserName !== "chromium", "measured once, in Chromium");
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      storageState: storageStatePath("prog002"),
    });
    const page = await context.newPage();
    await page.goto(FREE_LESSON, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Add a phrase" }).click();
    await expect(dialog(page)).toBeVisible();
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    console.log(`[1280] ${FREE_LESSON} dialog open: scrollWidth/innerWidth ${m.sw}/${m.iw}`);
    expect(m.sw).toBeLessThanOrEqual(1280);
    await context.close();
  });
});
