/**
 * 360px overflow check: the part of the verification procedure that every
 * card touching UI runs (CLAUDE.md "Working agreement", .claude/skills/
 * verify). For each path it loads the page in system Edge at 360x800 and
 * prints `scrollWidth/innerWidth`; a page that scrolls sideways prints FAIL
 * and the elements that stick out. Exit 1 on any FAIL, any non-2xx response,
 * or a page that matched nothing to measure.
 *
 *   npx tsx scripts/viewport360.ts --base=http://localhost:3000 /join/<token> /my
 *   npx tsx scripts/viewport360.ts --base=... --as=user@x.test:password /my /studio/learners
 *   --expect="Your teachers" (repeatable) fails a page that lacks the text, so a
 *   login bounce or an empty state cannot pass as "no overflow".
 *   npx tsx scripts/viewport360.ts --base=... --cookie=<name>=<value> /my   # e.g. the RU choice
 *
 * `--as` signs in through /login first (needs a confirmed password account,
 * made with the Admin API per the verify skill). Run it against `npm run
 * dev` or `next start`; it never writes anything. Use `--width=` to measure
 * another width.
 */
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const opt = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const base = opt("base") ?? "http://localhost:3000";
const width = Number(opt("width") ?? 360);
const as = opt("as");
const expect = args.filter((a) => a.startsWith("--expect=")).map((a) => a.slice(9)); // text every page must contain
const cookie = opt("cookie"); // name=value, e.g. the saved EN/RU choice
const paths = args.filter((a) => a.startsWith("/"));

if (paths.length === 0) {
  console.error("usage: viewport360.ts [--base=URL] [--as=email:password] [--width=360] /path ...");
  process.exit(2);
}

async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({ viewport: { width, height: 800 } });
  if (cookie) {
    const i = cookie.indexOf("=");
    await context.addCookies([{ name: cookie.slice(0, i), value: cookie.slice(i + 1), url: base }]);
  }
  const page = await context.newPage();
  let failed = false;
  try {
    if (as) {
      const i = as.indexOf(":");
      await page.goto(`${base}/login`);
      await page.fill("#email", as.slice(0, i));
      await page.fill("#password", as.slice(i + 1));
      await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }), page.click("button[type=submit]")]);
    }
    for (const path of paths) {
      const res = await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
      const status = res?.status() ?? 0;
      const m = await page.evaluate((w) => {
        const out: string[] = [];
        for (const el of Array.from(document.body.querySelectorAll("*"))) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.right > w + 0.5 && out.length < 5) {
            out.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""} right=${Math.round(r.right)}`);
          }
        }
        return { scroll: document.documentElement.scrollWidth, inner: window.innerWidth, text: document.body.innerText.trim().length, body: document.body.innerText, out };
      }, width);
      const missing = expect.filter((t) => !m.body.includes(t));
      const bad = missing.length > 0 || status < 200 || status >= 300 || m.text === 0 || m.scroll > m.inner;
      if (bad) failed = true;
      console.log(`${path} | ${status} | scrollWidth/innerWidth ${m.scroll}/${m.inner}${missing.length ? ` | MISSING ${JSON.stringify(missing)}` : ""}${bad ? " | FAIL" : ""}`);
      if (m.scroll > m.inner) for (const o of m.out) console.log(`    sticks out: ${o}`);
    }
  } finally {
    await browser.close();
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
