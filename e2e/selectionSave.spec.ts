/**
 * PROG-023 (docs/decisions/0253, 0254): save a phrase by selecting it, in both phone engines at
 * 360px with touch, signed in as prog002-learner.
 *
 * The selection is made from code (`selectRange`: a Range over given text, then addRange, or
 * setBaseAndExtent for a backwards one). The long-press itself is NOT emulated: this proves the
 * bar's logic and the save, not a phone's selection gesture or its menu. Step 0 of 0254 showed both
 * engines fire `selectionchange` for a selection made this way.
 *
 * Every row this spec saves is one of the fixture's phrases (selection-lesson, seeded by
 * scripts/seed-local-fixtures.ts) or starts with PREFIX; beforeEach and afterAll delete them with the
 * local stack's service key.
 */

import { createClient } from "@supabase/supabase-js";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { PHONE_WIDTH } from "../playwright.config";
import { FIXTURES, storageStatePath } from "./fixtures";
import { readCaptures, touchDrag, watchCaptures } from "./touchDrag";

const LESSON = "/courses/play-006-smoke/selection-lesson";
const GAPS_LESSON = "/courses/play-006-smoke/gaps-lesson";
const DRAG_LESSON = "/courses/future-imperfect/applied-practice";
const PREFIX = "e2e-prog023";
const THEORY_SENTENCE = "Keep the phrase on second thought for later.";
const RUSSIAN = "Другими словами, не торопись.";
const LONG = "This paragraph is deliberately long";
/** Every phrase the spec can save from the fixtures, for the cleanup. */
const SAVED_PHRASES = ["on second thought", "second thought", "Другими словами", "Keep the phrase"];

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error(`the cleanup needs the local stack's URL and service key in the env (got ${url ?? "no URL"})`);
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

let cachedId: string | null = null;
async function learnerId(): Promise<string> {
  if (cachedId) return cachedId;
  const { data, error } = await admin().auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const user = data.users.find((u) => u.email === FIXTURES.prog002);
  if (!user) throw new Error(`${FIXTURES.prog002} is missing`);
  return (cachedId = user.id);
}

async function deleteSpecRows() {
  const userId = await learnerId();
  const a = await admin().from("notebook_entries").delete({ count: "exact" }).eq("user_id", userId).eq("kind", "own").in("phrase", SAVED_PHRASES);
  const b = await admin().from("notebook_entries").delete({ count: "exact" }).eq("user_id", userId).eq("kind", "own").like("phrase", `${PREFIX}%`);
  if (a.error) throw a.error;
  if (b.error) throw b.error;
  return (a.count ?? 0) + (b.count ?? 0);
}

async function rows(phrase: string) {
  const { data, error } = await admin()
    .from("notebook_entries")
    .select("id, phrase, note, course_id, lesson_id")
    .eq("user_id", await learnerId())
    .eq("kind", "own")
    .eq("phrase", phrase);
  if (error) throw error;
  return data;
}

async function measure(page: Page, label: string) {
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  console.log(`[${test.info().project.name}] ${label}: scrollWidth/innerWidth ${m.sw}/${m.iw}`);
  expect(m.sw, `${label} scrolls sideways`).toBeLessThanOrEqual(PHONE_WIDTH);
  expect(m.iw, `${label}: the layout viewport widened past ${PHONE_WIDTH}`).toBe(PHONE_WIDTH);
}

/**
 * Selects `sub` inside the first text node under `root` whose text contains `node`. `from`/`to`
 * cut the selection inside `sub` (to make a cut word); `backwards` puts the anchor at the end, as a
 * handle dragged leftwards does. The long-press is not emulated.
 */
async function selectRange(
  page: Page,
  node: string,
  sub: string = node,
  opts: { from?: number; to?: number; backwards?: boolean; root?: string } = {},
) {
  const text = await page.evaluate(
    ({ node, sub, from, to, backwards, root }) => {
      const base = root ? document.querySelector(root) : document.body;
      if (!base) throw new Error(`no ${root}`);
      const walker = document.createTreeWalker(base, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = walker.nextNode())) if (n.textContent?.includes(node)) break;
      if (!n) throw new Error(`no text node with "${node}"`);
      const at = n.textContent!.indexOf(sub);
      if (at < 0) throw new Error(`"${sub}" is not in "${n.textContent}"`);
      const start = at + (from ?? 0);
      const end = at + (to ?? sub.length);
      const s = getSelection()!;
      s.removeAllRanges();
      if (backwards) s.setBaseAndExtent(n, end, n, start);
      else {
        const r = document.createRange();
        r.setStart(n, start);
        r.setEnd(n, end);
        s.addRange(r);
      }
      return s.toString();
    },
    { node, sub, ...opts },
  );
  return text;
}

const collapse = (page: Page) => page.evaluate(() => getSelection()?.collapseToStart());
const bar = (page: Page) => page.locator("[data-selection-bar]");
const saveButton = (page: Page) => page.locator('[data-selection-save="button"]');
const savedStatus = (page: Page) => bar(page).getByRole("status").filter({ hasText: "Saved to your notebook" });
/** One animation frame and a little more: the watcher reads once per frame. */
const frame = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 60))));

async function expectHidden(page: Page) {
  await frame(page);
  await expect(bar(page)).toHaveAttribute("data-state", "hidden");
  await expect(bar(page).locator("*")).toHaveCount(0);
}

async function saveSelection(page: Page, phrase: string) {
  await expect(saveButton(page)).toHaveText(`Save “${phrase}”`);
  await saveButton(page).tap();
  await expect(savedStatus(page)).toBeVisible();
}

async function bottomUnderStrip(page: Page, el: Locator) {
  const stripBottom = await page.locator(".sticky").first().evaluate((s) => s.getBoundingClientRect().bottom);
  const top = await el.evaluate((b) => b.getBoundingClientRect().top);
  return { stripBottom, top };
}

test.beforeEach(async () => {
  await deleteSpecRows();
});
test.afterAll(async () => {
  console.log(`cleanup: deleted ${await deleteSpecRows()} spec rows`);
});

test.describe("signed out", () => {
  test("no bar on a selection (the signed-in tests below are the control)", async ({ page }) => {
    await page.goto(LESSON, { waitUntil: "networkidle" });
    await expect(page.getByText(THEORY_SENTENCE)).toBeVisible();
    await selectRange(page, THEORY_SENTENCE, "on second thought");
    await frame(page);
    await expect(bar(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add a phrase" })).toHaveCount(0);
  });
});

test.describe("signed in as prog002-learner", () => {
  test.use({ storageState: storageStatePath("prog002") });

  test("saves a selected phrase and finds it in the notebook under the course", async ({ page }) => {
    await page.goto(LESSON, { waitUntil: "networkidle" });
    await expectHidden(page);
    await measure(page, "hidden");
    expect(await selectRange(page, THEORY_SENTENCE, "on second thought")).toBe("on second thought");
    await expect(saveButton(page)).toBeVisible();
    // Directly under the strip.
    const pos = await bottomUnderStrip(page, bar(page));
    console.log(`[${test.info().project.name}] bar top ${pos.top}, strip bottom ${pos.stripBottom}`);
    // top-full is the strip's padding edge: the bar covers the strip's 2px bottom border and draws its own.
    expect(pos.stripBottom - pos.top).toBeGreaterThanOrEqual(0);
    expect(pos.stripBottom - pos.top).toBeLessThanOrEqual(2);
    const box = (await saveButton(page).boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    await measure(page, "ready");

    await saveSelection(page, "on second thought");
    await measure(page, "saved");
    const saved = await rows("on second thought");
    expect(saved).toHaveLength(1);
    expect(saved[0].lesson_id, "filed under the lesson").not.toBeNull();

    const href = await bar(page).getByRole("link", { name: "Notebook" }).getAttribute("href");
    expect(href).toBe(`/my/notebook?course=${saved[0].course_id}`);
    await page.goto(href!, { waitUntil: "networkidle" });
    await expect(page.getByText("on second thought", { exact: true })).toBeVisible();
  });

  test("a Russian phrase", async ({ page }) => {
    await page.goto(LESSON, { waitUntil: "networkidle" });
    await selectRange(page, RUSSIAN, "Другими словами,");
    await saveSelection(page, "Другими словами");
    expect(await rows("Другими словами")).toHaveLength(1);
  });

  test("a word cut at both ends is saved whole, forwards and backwards", async ({ page }) => {
    await page.goto(LESSON, { waitUntil: "networkidle" });
    // "cond thou" out of "second thought".
    expect(await selectRange(page, THEORY_SENTENCE, "second thought", { from: 2, to: 8 })).toBe("cond t");
    await expect(saveButton(page)).toHaveText("Save “second thought”");
    // Backwards: the anchor at the end (correction 2, 0254): the context still comes from the right ends.
    expect(await selectRange(page, THEORY_SENTENCE, "second thought", { from: 2, to: 10, backwards: true })).toBe("cond tho");
    await frame(page);
    await saveSelection(page, "second thought");
    expect(await rows("second thought")).toHaveLength(1);
  });

  test("over 200 characters shows the too-long line and no button", async ({ page }) => {
    await page.goto(LESSON, { waitUntil: "networkidle" });
    const text = await selectRange(page, LONG, "This paragraph");
    expect(text).toBe("This paragraph");
    // The whole paragraph (230 characters).
    await page.evaluate((needle) => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = walker.nextNode())) if (n.textContent?.includes(needle)) break;
      const r = document.createRange();
      r.selectNodeContents(n!);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(r);
    }, LONG);
    await expect(bar(page).locator('[data-selection-save="too-long"]')).toHaveText(
      /^Select up to 200 characters to save a phrase\. This selection has 229\.$/,
    );
    await expect(saveButton(page)).toHaveCount(0);
    await measure(page, "too long");
  });

  test("a selection inside a text input or a drag item shows no bar; a theory selection does", async ({ page }) => {
    await page.goto(GAPS_LESSON, { waitUntil: "networkidle" });
    // A learner's selection in a field: focus, type, then select part of it.
    const gap = page.getByLabel("Gap 1", { exact: true });
    await gap.tap();
    await gap.pressSequentially("hello world");
    await gap.evaluate((el: HTMLInputElement) => el.setSelectionRange(0, 5));
    await frame(page);
    expect(await page.evaluate(() => getSelection()?.toString())).toBe("hello");
    await expectHidden(page);
    // And with Shift+Arrow.
    await gap.press("End");
    for (let i = 0; i < 5; i++) await gap.press("Shift+ArrowLeft");
    await expectHidden(page);
    // Control, same page: a selection in the lesson's text.
    await gap.blur();
    const heading = (await page.locator("h1, h2").first().textContent())!.trim();
    await selectRange(page, heading, heading.split(" ")[0]);
    await expect(saveButton(page)).toBeVisible();

    await page.goto(DRAG_LESSON, { waitUntil: "networkidle" });
    const chip = page.locator("[aria-roledescription]").filter({ hasText: /\p{L}{3}/u }).first();
    const chipText = (await chip.textContent())!.trim();
    await chip.scrollIntoViewIfNeeded();
    await page.evaluate((el) => {
      const r = document.createRange();
      r.selectNodeContents(el!);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(r);
    }, await chip.elementHandle());
    console.log(`[${test.info().project.name}] drag item selected: "${chipText.slice(0, 40)}"`);
    await expectHidden(page);
    // Control, same page.
    await selectRange(page, "Put these four sentences in order", "Put these four");
    await expect(saveButton(page)).toHaveText("Save “Put these four”");
  });

  test("collapsing hides the ready bar; a saved bar stays", async ({ page }) => {
    await page.goto(LESSON, { waitUntil: "networkidle" });
    await selectRange(page, THEORY_SENTENCE, "Keep the phrase");
    await expect(saveButton(page)).toBeVisible();
    await collapse(page);
    await expectHidden(page);

    await selectRange(page, THEORY_SENTENCE, "Keep the phrase");
    await saveSelection(page, "Keep the phrase");
    await collapse(page);
    await frame(page);
    await expect(savedStatus(page)).toBeVisible();
    await bar(page).getByRole("button", { name: "Close" }).tap();
    await expectHidden(page);
  });

  test("two taps make one row: a saved phrase selected again shows as saved", async ({ page }) => {
    await page.goto(LESSON, { waitUntil: "networkidle" });
    await selectRange(page, THEORY_SENTENCE, "on second thought");
    await saveSelection(page, "on second thought");
    await collapse(page);
    await bar(page).getByRole("button", { name: "Close" }).tap();
    await expectHidden(page);
    await selectRange(page, THEORY_SENTENCE, "on second thought");
    await expect(savedStatus(page)).toBeVisible();
    await expect(saveButton(page)).toHaveCount(0);
    const count = (await rows("on second thought")).length;
    console.log(`[${test.info().project.name}] rows after a save and a second selection: ${count}`);
    expect(count).toBe(1);
  });

  test("Undo removes the row; the phrase can be saved again", async ({ page }) => {
    await page.goto(LESSON, { waitUntil: "networkidle" });
    await selectRange(page, THEORY_SENTENCE, "on second thought");
    await saveSelection(page, "on second thought");
    await bar(page).getByRole("button", { name: "Undo" }).tap();
    await expect(bar(page).getByRole("status")).toHaveText("Removed from your notebook");
    await measure(page, "removed");
    expect(await rows("on second thought")).toHaveLength(0);
    await selectRange(page, THEORY_SENTENCE, "on second thought");
    await saveSelection(page, "on second thought");
    expect(await rows("on second thought")).toHaveLength(1);
  });

  test("Add a note opens the dialog in edit mode and saves a note the notebook shows", async ({ page }) => {
    await page.goto(LESSON, { waitUntil: "networkidle" });
    await selectRange(page, THEORY_SENTENCE, "on second thought");
    await saveSelection(page, "on second thought");
    await bar(page).getByRole("button", { name: "Add a note" }).tap();
    const d = page.getByRole("dialog", { name: "Add a note" });
    await expect(d).toBeVisible();
    await d.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    await expect(d.getByLabel("Phrase", { exact: true })).toHaveValue("on second thought");
    await measure(page, "dialog, edit mode");
    const note = `${PREFIX} a note ${test.info().project.name}`;
    await d.getByLabel("Note (optional)").fill(note);
    await d.getByRole("button", { name: "Save note" }).tap();
    await expect(d.getByRole("status")).toHaveText("Note saved");
    await expect(d.getByRole("button", { name: "Add another" })).toHaveCount(0);
    await measure(page, "dialog, edit mode, saved");
    await d.getByRole("button", { name: "Close" }).first().tap();
    await expect(d).toHaveCount(0);
    // Focus back on the bar's Add a note, which is still showing (0254 Decision 4).
    await expect(bar(page).getByRole("button", { name: "Add a note" })).toBeFocused();

    const saved = await rows("on second thought");
    expect(saved).toHaveLength(1);
    expect(saved[0].note).toBe(note);
    await page.goto(`/my/notebook?course=${saved[0].course_id}`, { waitUntil: "networkidle" });
    await expect(page.getByText(note)).toBeVisible();
  });

  test("the timer: a saved bar closes after 8 s with no focus or pointer inside", async ({ page }) => {
    await page.goto(LESSON, { waitUntil: "networkidle" });
    await selectRange(page, THEORY_SENTENCE, "on second thought");
    await saveSelection(page, "on second thought");
    // Move focus and the pointer away: a tap on lesson text further down (the bar can cover the
    // first line under the strip, 0253's trade-off, which WebKit's layout here shows).
    await page.getByText(new RegExp(`^${LONG}`)).tap();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.waitForTimeout(5000);
    await expect(savedStatus(page)).toBeVisible();
    await page.waitForTimeout(4000);
    await expectHidden(page);
  });

  test("refusals: the cap, not readable, an expired session, failed; and the saving state", async ({ page, context }) => {
    await page.goto(LESSON, { waitUntil: "networkidle" });
    const refused = bar(page).locator('[data-selection-save="refused"]');

    // Saving: the action held back, so the disabled state can be measured.
    let release: () => void = () => {};
    const held = new Promise<void>((r) => (release = r));
    await page.route(LESSON, async (route) => {
      if (route.request().method() === "POST") await held;
      await route.continue();
    });
    await selectRange(page, THEORY_SENTENCE, "on second thought");
    await saveButton(page).tap();
    await expect(saveButton(page)).toHaveText("Saving…");
    await expect(saveButton(page)).toBeDisabled();
    await measure(page, "saving");
    release();
    await expect(savedStatus(page)).toBeVisible();
    await page.unroute(LESSON);
    await bar(page).getByRole("button", { name: "Undo" }).tap();
    await expect(bar(page).getByRole("status")).toHaveText("Removed from your notebook");

    // failed: the action's request aborted.
    await page.route(LESSON, (route) => (route.request().method() === "POST" ? route.abort() : route.continue()));
    await selectRange(page, THEORY_SENTENCE, "Keep the phrase");
    await saveButton(page).tap();
    await expect(refused).toHaveText("Couldn't save. Try again.");
    await measure(page, "refused: failed");
    await page.unroute(LESSON);

    // not_readable: the lesson closed to this learner after the page loaded.
    const { data: lesson, error } = await admin()
      .from("lessons")
      .select("id, access_level, courses!inner(slug)")
      .eq("slug", "selection-lesson")
      .eq("courses.slug", "play-006-smoke")
      .single();
    if (error) throw error;
    const { error: closeErr } = await admin().from("lessons").update({ access_level: "entitled" }).eq("id", lesson.id);
    if (closeErr) throw closeErr;
    try {
      await selectRange(page, THEORY_SENTENCE, "second thought");
      await saveButton(page).tap();
      await expect(refused).toHaveText("This lesson isn't open to you now, so the phrase wasn't saved.");
      await measure(page, "refused: not_readable");
    } finally {
      await admin().from("lessons").update({ access_level: lesson.access_level }).eq("id", lesson.id);
    }

    // The cap (PT429).
    const userId = await learnerId();
    const { count } = await admin().from("notebook_entries").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("kind", "own");
    const fill = Array.from({ length: 1000 - (count ?? 0) }, (_, i) => ({ user_id: userId, kind: "own", phrase: `${PREFIX} cap ${i}` }));
    const { error: capErr } = await admin().from("notebook_entries").insert(fill);
    if (capErr) throw capErr;
    try {
      await selectRange(page, RUSSIAN, "Другими словами");
      await saveButton(page).tap();
      await expect(refused).toHaveText(/^You have 1,000 notes, which is the limit/);
      await measure(page, "refused: note_cap");
    } finally {
      await deleteSpecRows();
    }

    // An expired session, with a sign-in link back here.
    await context.clearCookies();
    await selectRange(page, THEORY_SENTENCE, "on second thought");
    await saveButton(page).tap();
    await expect(refused).toContainText("Your session has ended, so the phrase wasn't saved.");
    await expect(refused.getByRole("link", { name: "Sign in again" })).toHaveAttribute(
      "href",
      `/login?next=${encodeURIComponent(LESSON)}`,
    );
    await measure(page, "refused: unauthenticated");
  });

  test("a typed gap keeps its text across a save", async ({ page }) => {
    await page.goto(GAPS_LESSON, { waitUntil: "networkidle" });
    const gap = page.getByLabel("Gap 1", { exact: true });
    await gap.fill("go");
    await gap.blur();
    const heading = (await page.locator("h1, h2").first().textContent())!.trim();
    const word = heading.split(" ")[0];
    await selectRange(page, heading, word);
    await expect(saveButton(page)).toBeVisible();
    await saveButton(page).tap();
    await expect(savedStatus(page)).toBeVisible();
    await expect(gap).toHaveValue("go");
    await admin().from("notebook_entries").delete().eq("user_id", await learnerId()).eq("kind", "own").eq("phrase", word);
  });

  test("applied-practice: a drag still completes after the bar has shown and hidden", async ({ page, browserName }) => {
    await page.goto(DRAG_LESSON, { waitUntil: "networkidle" });
    await selectRange(page, "Put these four sentences in order", "Put these four");
    await expect(saveButton(page)).toBeVisible();
    await collapse(page);
    await expectHidden(page);

    const handles = page.getByRole("button", { name: /^Drag to reorder "/ });
    await expect(handles).toHaveCount(4);
    const order = async () => handles.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    const before = await order();
    const first = handles.first();
    await first.scrollIntoViewIfNeeded();
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
    console.log(`[${test.info().project.name}] applied-practice drag sensor after the bar: ${sensor}`);
    await expect.poll(order).not.toEqual(before);
  });
});

test.describe("1280", () => {
  test("saved bar at 1280 (chromium only)", async ({ browser, browserName }) => {
    test.skip(browserName !== "chromium", "measured once, in Chromium");
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, storageState: storageStatePath("prog002") });
    const page = await context.newPage();
    await page.goto(LESSON, { waitUntil: "networkidle" });
    await selectRange(page, THEORY_SENTENCE, "on second thought");
    await expect(saveButton(page)).toBeVisible();
    await saveButton(page).click();
    await expect(savedStatus(page)).toBeVisible();
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    console.log(`[1280] ${LESSON} saved: scrollWidth/innerWidth ${m.sw}/${m.iw}`);
    expect(m.sw).toBeLessThanOrEqual(1280);
    await context.close();
  });
});

