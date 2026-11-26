/**
 * Cold-load JS byte-budget guard (OPS-006).
 *
 * Next 16 removed `next build`'s `First Load JS`/size columns ("we found
 * these to be inaccurate in server-driven architectures using React Server
 * Components... both our Turbopack and Webpack implementations had issues" —
 * node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md), so
 * docs/handoff.md's per-route performance budgets have nothing to cite. This
 * measures the replacement directly: a cold, cache-disabled `next start` load
 * through headless Chromium, summing the compressed bytes of every script
 * resource actually transferred over the network for each configured route.
 *
 * "Compressed" and "actually downloaded" come from Chrome DevTools Protocol's
 * `Network.loadingFinished` event `encodedDataLength` — the real wire byte
 * count post-compression, not a `Content-Length` header (absent on chunked
 * responses) and not the decoded/parsed size `response.body()` would give.
 *
 * A route is a hard failure — not a 0 KB pass — if:
 *   - navigation returns a non-2xx status,
 *   - navigation times out,
 *   - the page raises an uncaught error (`page.on("pageerror")`), or
 *   - any downloaded script chunk's content contains a forbidden-package
 *     signature (OPS-013) — see FORBIDDEN_SIGNATURES below. This catches a
 *     Turbopack commons-chunk leak that no explicit import statement causes,
 *     which is what the ESLint no-restricted-imports rule (eslint.config.mjs)
 *     cannot see.
 *
 * Usage:
 *   npm run budget:local   (= scripts/budget.ts --local)  ← the way to measure EVERY route
 *   npm run budget         (= npx tsx --env-file=.env.local scripts/budget.ts [--url=<origin>])
 *
 * --local (OPS-042, docs/decisions/0245) builds and serves against the local
 * Supabase stack: it reads the stack's URL and keys from `npx supabase@2.120.0
 * status -o env` and hands them to `next build` and `next start`. Every
 * signed-in route's fixture and every `seeded` route's data exist only there,
 * so this is the documented way to get a KB figure for every route in ROUTES.
 * Before it: `npx supabase@2.120.0 start`, `db reset` if migrations are
 * pending, and the seed (scripts/seed-local-fixtures.ts with the local URL and
 * service key in the env; `npm run seed:local` alone reads `.env.local`'s hosted
 * URL and refuses. The verify skill's "Budget" section has the line).
 * Plain `npm run budget` serves against whatever `.env.local` names, which is
 * the hosted project: there the signed-in routes FAIL at once with the login
 * form's answer and the fixture's email, and a seeded route's 404 names the seed.
 * Every run prints the Supabase URL it serves (a hosted project's ref masked).
 *
 * --url (or BUDGET_BASE_URL) points the guard at an already-running server —
 * e.g. OPS-010's launch rehearsal against the deployed production URL.
 * Without it, this script starts its own local `next start` on an ephemeral
 * port and tears it down after, running `next build` first unless `.next`
 * holds a build this script made from the current sources (OPS-017,
 * docs/decisions/0089). After each successful build it writes a sha256 of
 * every file `git ls-files -co --exclude-standard` lists, plus the `.env*`
 * files `next build` reads (NEXT_PUBLIC_* values are frozen into the build),
 * to `.next/budget-source-fingerprint`, and reuses the build only when that
 * stamp matches the sources now. No stamp, a mismatch or a missing build all
 * rebuild. Since OPS-042 the stamp also records the NEXT_PUBLIC_SUPABASE_URL
 * the build was made with and the BUILD_ID it produced: a run that will serve
 * another URL, or finds a BUILD_ID from a `next build` run outside the guard,
 * rebuilds. --url builds nothing and checks nothing about `.next`.
 *
 * The `/courses/play-006-smoke/free-lesson` route below requires
 * `npm run seed:local` (scripts/seed-local-fixtures.ts) to have been run
 * against the target's Supabase project first, or it 404s (a hard FAIL, per
 * this file's own rules — see docs/decisions/0056).
 */

import { chromium, type CDPSession } from "@playwright/test";
import type { ChildProcess } from "node:child_process";
import { describeSupabaseUrl } from "./budgetBuildStamp";
import { signInThroughForm } from "./fixtureSignIn";
import { applyLocalStackEnv, die, killProcessTree, SEED_HINT, startLocalServer } from "./localServer";

// ── Configured routes ───────────────────────────────────────────────────
// Each entry's budgetKB is a recorded decision, not a guess — re-derive it
// from a real `npm run budget` run before raising it. /login is the smallest
// route that exists today (no English route exists yet; see docs/handoff.md
// "Performance boundary") and its measured KB is the floor every English
// route budget in a future M2 card starts from.
//
// `guardForbiddenSignatures` (OPS-013) mirrors the ESLint no-restricted-imports
// rule's own file scope (eslint.config.mjs: app/(english)/**, lesson-player):
// only English-surface routes are checked for FORBIDDEN_SIGNATURES. A
// Colloquiz route like /login legitimately ships @supabase/ssr — flagging it
// there would be a false positive, not a leak.
//
// `signInAs` (PROG-002, docs/decisions/0120) measures a route as a signed-in
// user: one of scripts/seed-local-fixtures.ts's local-only fixture accounts,
// signed in through the real /login form in a throwaway context. Only the
// cookies carry over into the measured context, which is otherwise as cold
// as every other route's (the 0115 "Budget" method, now scripted). For a
// page that redirects a signed-out visitor, a signed-out measurement would
// measure the redirect's target instead.
//
// `phone` (OPS-028, docs/decisions/0176) measures the route in a phone context
// (390x844, isMobile, hasTouch), whose pointer is coarse and has no hover, so
// the desktop-only code behind a media query is not requested. `alsoForbid`
// adds signatures to FORBIDDEN_SIGNATURES for that entry only: the byte budget
// alone cannot catch code that must not reach a phone when its chunk is smaller
// than the headroom.
type RouteBudget = {
  path: string;
  budgetKB: number;
  guardForbiddenSignatures: boolean;
  signInAs?: string;
  phone?: boolean;
  alsoForbid?: string[];
  /** The route's data comes from scripts/seed-local-fixtures.ts: its 404 names the seed (OPS-042). */
  seeded?: boolean;
};

const ROUTES: RouteBudget[] = [
  { path: "/login", budgetKB: 380, guardForbiddenSignatures: false },
  // SHELL-010: the English landing page — the reel-to-lesson entry point
  // docs/handoff.md's performance boundary is written for. Measured against
  // the hosted project (no local-seed dependency: it lists whatever is
  // actually published there, same as /login needs no seed) at 172.0 KB.
  // budgetKB is that measurement plus ~4.5% headroom (the PLAY-012/SHELL-008
  // precedent, docs/decisions/0057/0059) — re-derive both from a real
  // `npm run budget` run before raising it, never guess. The 172.0 KB above
  // had gone stale: the clean tree printed 185.0 KB (OVER) on 2026-10-07,
  // and the landing redesign brought it back to 179.8 KB without raising
  // budgetKB (docs/decisions/0078, Decision 5) — 0.2 KB of headroom left.
  //
  // OPS-028 (docs/decisions/0176): 180 -> 202. Owner, 2026-10-18: VIS-004 (the
  // sticker digits and the start button's sparks, 0174) and VIS-005 (the living grid
  // paper, 0175) were approved to take `/` past 180. Measured after both cards:
  // 192.6 KB with the hosted env (191.6 KB on the local stack, whose shorter URL and
  // key are baked into the bundle). budgetKB is the hosted figure plus ~4.5% headroom
  // (the PLAY-012 precedent, docs/decisions/0057), rounded up to a whole KB. The
  // desktop context is Playwright's default (1280x720, a fine hovering pointer),
  // inside the grid's media query, so the figure includes the grid chunk.
  { path: "/", budgetKB: 202, guardForbiddenSignatures: true },
  // OPS-028: the same route in a phone context, with its own budget derived the same
  // way: 185.6 KB hosted env (184.7 KB local), plus ~4.5%, rounded up. A phone gets
  // the sticker digits and the sparks but never the grid (0175 Decision 6). The grid's
  // chunk is about 6 KB gzip, less than this entry's headroom, so bytes alone would not
  // catch it reaching a phone: `alsoForbid` names its signatures (0175 matched on both)
  // and a chunk containing either is a FAIL.
  { path: "/", budgetKB: 194, guardForbiddenSignatures: true, phone: true, alsoForbid: ["cascadeReach", "hexagon"] },
  // PLAY-006/PLAY-012 (docs/decisions/0056, 0057): a REAL authored lesson —
  // `future-imperfect`'s first lesson, `true-or-false` — not a synthetic
  // single-item fixture. Seeded from authored/courses/future-imperfect.json
  // by scripts/seed-local-fixtures.ts, on a local Supabase stack only; this
  // route 404s (a hard FAIL below, never a silent 0 KB pass) against any
  // environment without that seed, including hosted today, which has no
  // published course yet. If future-imperfect is ever actually imported and
  // published for real (OPS-010), this same slug already matches it. The
  // budgetKB below is a TARGET, not necessarily today's number — see
  // docs/decisions/0057 for the measured baseline and what would close any
  // gap; do not raise it to match whatever the guard currently prints.
  { path: "/courses/future-imperfect/true-or-false", budgetKB: 260, guardForbiddenSignatures: true, seeded: true },
  // PLAY-012 (docs/decisions/0057): a SEPARATE regression budget for a
  // drag-heavy lesson — `future-imperfect`'s `applied-practice` (matching +
  // ordering + selection, 25 blocks; also seeded by
  // scripts/seed-local-fixtures.ts). This is NOT the 260 KB reel-entry-point
  // budget (docs/handoff.md scopes that to a course's first free lesson
  // only) — a lesson that legitimately loads dnd-kit will never clear it.
  // budgetKB below is this lesson's own measured post-split size (277.4 KB,
  // PLAY-012, docs/decisions/0057 addendum) plus ~12.6 KB (4.5%) headroom;
  // re-derive both from a real `npm run budget` run before changing it,
  // never guess.
  { path: "/courses/future-imperfect/applied-practice", budgetKB: 290, guardForbiddenSignatures: true, seeded: true },
  // SHELL-008: the course page itself — `future-imperfect`'s catalogue-card
  // target. Same local-seed dependency as the two routes above (requires
  // `npm run seed:local`). Measured 173.3 KB after fixing a barrel-import
  // leak (the page imported LESSON_HEADER_COLUMN_CLASS through
  // @/app/components/lesson-player, which also pulls in LessonPlayer +
  // practiceRenderer/dnd-kit — this route uses neither; see
  // docs/decisions/0059). budgetKB below is that measurement plus ~4.5%
  // headroom (the PLAY-012 precedent, docs/decisions/0057) — re-derive both
  // from a real `npm run budget` run before raising it, never guess.
  { path: "/courses/future-imperfect", budgetKB: 182, guardForbiddenSignatures: true, seeded: true },
  // COH-003 (docs/decisions/0107): the invite claim page. Every state is a
  // Server Component and the Join action is a plain form POST, so the
  // page ships only the layout's and next/link's JS; an unknown token
  // (this path) renders the same chunks as a live one and needs no seed,
  // only migration 059 on the target (where 059 is missing, the preview RPC
  // errors and the page throws; assumed, not measured, to FAIL). Measured 175.3 KB on the local stack; budgetKB is that
  // plus ~4.5% headroom (the PLAY-012 precedent, docs/decisions/0057).
  // Re-derive both from a real `npm run budget` run before raising it.
  { path: "/invite/00000000000000000000000000000000", budgetKB: 183, guardForbiddenSignatures: true },
  // TCH-001 (docs/decisions/0148): a teacher's student link. Same shape as
  // the invite page above (Server Components, the Join action a plain form
  // POST), so it ships the layout's and next/link's JS only. An unknown
  // token (this path) renders the same chunks as a live one. Needs migration
  // 076 on the target: with it missing the preview RPC errors and the page
  // throws (a FAIL, not a silent pass). budgetKB starts at the invite
  // page's and is re-derived from a real `npm run budget` run (0148).
  { path: "/join/00000000000000000000000000000000", budgetKB: 183, guardForbiddenSignatures: true },
  // PROG-008 (docs/decisions/0209): where a course-complete share link lands.
  // A Server Component with no client JS of its own (the layout's and
  // next/link's only), so budgetKB starts at the invite page's, the same
  // shape; re-derived from a real `npm run budget` run (0209 "Measured").
  { path: "/completed/future-imperfect", budgetKB: 183, guardForbiddenSignatures: true, seeded: true },
  // COH-005 (docs/decisions/0115): the before/after screen, signed out (its
  // sign-in card) — the run is scripts/seed-local-fixtures.ts's cohort
  // fixture at a fixed id; without that seed the page 404s, a hard FAIL.
  // Measured 176.3 KB on the local stack, and 176.3 KB again for a signed-in
  // learner with a player on the page (0115 "Budget"): SignedAudio is a
  // static import, so the signed-out route already ships it. budgetKB is
  // that plus ~4.5% headroom (the PLAY-012 precedent, docs/decisions/0057).
  // Re-derive both from a real `npm run budget` run before raising it.
  { path: "/runs/c0050000-0000-4000-8000-00000000f1a0", budgetKB: 184, guardForbiddenSignatures: true, seeded: true },
  // PROG-002 (docs/decisions/0120): the learner home, signed in as the seed's
  // learner-home fixture (an attempt, an extended enrolment with a call, a
  // published feedback), so every section renders. Signed out it redirects
  // to /login. Needs `scripts/seed-local-fixtures.ts` on the target; without
  // the account the sign-in fails, a hard FAIL. Measured 171.5 KB on the
  // local stack; budgetKB is that plus ~4.5% headroom (the PLAY-012
  // precedent, docs/decisions/0057). Re-derive both from a real
  // `npm run budget` run before raising it.
  { path: "/my", budgetKB: 180, guardForbiddenSignatures: true, signInAs: "prog002-learner@example.com" },
  // PROG-007 (docs/decisions/0191): the same page for the before/after fixture learner, who
  // has two analysed takes. The "AI feedback" list it was added for is gone (PROG-015,
  // docs/decisions/0242); the entry stays as /my for a learner with a notebook. It measured 174.4 KB
  // before and after PROG-007. budgetKB is that plus ~4.5% headroom (the PLAY-012 precedent, 0057).
  { path: "/my", budgetKB: 182, guardForbiddenSignatures: true, signInAs: "prog007-learner@example.com" },
  // PROG-007 (docs/decisions/0191): the before/after screen SIGNED IN, as the fixture learner of
  // a run that started 23 days ago (scripts/seed-local-fixtures.ts): both takes recorded and
  // analysed, a published final comment. With VOICE_ANALYSIS_MODE=on it draws the final AI
  // feedback beside the comment (the view's client chunk, 5.7 KB compressed, without the schema
  // library: docs/decisions/0191 "Budget"); the signed-out entry above measures the sign-in card
  // only. Measured 176.3 KB before and 171.0 KB after (local stack, mode on); budgetKB is the
  // after figure plus ~4.5% headroom (the PLAY-012 precedent, 0057).
  { path: "/runs/c0050000-0000-4000-8000-00000000f1a1", budgetKB: 179, guardForbiddenSignatures: true, signInAs: "prog007-learner@example.com" },
  // PROG-014 (docs/decisions/0240): the notebook, as the fixture learner with a row in every tab.
  // 180 is /my's own limit, fixed by the card (no card raises a budget, owner 2026-11-24), not
  // derived from this page's measurement.
  { path: "/my/notebook", budgetKB: 180, guardForbiddenSignatures: true, signInAs: "prog007-learner@example.com" },
  // TCH-004 (docs/decisions/0151): the learner's message list, signed in as the
  // same learner-home fixture. It ships the layout's JS only: the composer
  // lives on the thread page (/my/messages/[teacherId]), whose URL carries a
  // per-seed profile id and so has no stable entry here. Needs migration 079 on
  // the target (without it the list read throws, a FAIL). Measured 175.9 KB on
  // the local stack; budgetKB is that plus ~4.5% headroom (the PLAY-012
  // precedent, docs/decisions/0057). Re-derive both from a real
  // `npm run budget` run before raising it.
  { path: "/my/messages", budgetKB: 184, guardForbiddenSignatures: true, signInAs: "prog002-learner@example.com" },
  // docs/decisions/0181: the learner's settings, signed in as the same
  // learner-home fixture. Ships the theme control, the sign-in list and the
  // export/delete dialogs. The browser Supabase client (link, unlink, the
  // theme write) is imported on the first action, not with the page, so
  // @supabase/ssr is not in the first load; imported statically it was, and
  // the page measured 262.3 KB. Measured 199.4 KB on the local
  // stack; budgetKB is that plus ~4.5% headroom (the PLAY-012 precedent,
  // docs/decisions/0057). Re-derive both from a real `npm run budget` run
  // before raising it.
  { path: "/my/settings", budgetKB: 208, guardForbiddenSignatures: true, signInAs: "prog002-learner@example.com" },
  // COH-010 (docs/decisions/0173): a cohort course page as an ENROLLED learner,
  // the one state that carries the Telegram reminders panel (the visitor figure
  // is the /courses/future-imperfect entry above). Signed in as the learner-home
  // fixture, enrolled in the seed's cohort run. Needs scripts/seed-local-fixtures.ts
  // on the target. Measured 172.9 KB on the local stack (172.1 KB before the panel);
  // budgetKB is that plus ~4.5% headroom (the PLAY-012 precedent, docs/decisions/0057).
  // Re-derive both from a real `npm run budget` run before raising it.
  { path: "/courses/coh005-fixture", budgetKB: 181, guardForbiddenSignatures: true, signInAs: "prog002-learner@example.com" },
];

// ── CLI ──────────────────────────────────────────────────────────────────
function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

const urlOverride = getArg("url") ?? process.env.BUDGET_BASE_URL;
const useLocalStack = process.argv.includes("--local");
if (useLocalStack && urlOverride) die("--local starts its own server against the local stack; it cannot be combined with --url.");

// --local (OPS-042): build and serve against the local Supabase stack;
// scripts/localServer.ts holds the how and the why (docs/decisions/0245).
if (useLocalStack) applyLocalStackEnv("--local");
const servedSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

// ── Local server ────────────────────────────────────────────────────────
const LOCAL_PORT = 4173; // arbitrary, unlikely to collide with `next dev`'s 3000

// ── Commons-chunk content-signature guard (OPS-013) ─────────────────────
// no-restricted-imports (eslint.config.mjs) catches an explicit import
// statement in app/(english)/** or app/components/lesson-player/**. It
// cannot see a package Turbopack's own commons-chunk splitting pulls into a
// *shared* chunk that an English route downloads regardless of whether that
// route's own code imports it — that's exactly how OPS-012 found lucide-react's
// Icon base leaking into the SHELL-006 stub. This scans the actual downloaded
// chunk bytes for each forbidden package's name, the same content-based method
// decision 0046's addendum used to isolate Sentry's chunk
// (`grep -l -i sentry .next/static/chunks/*.js`), rather than inferring a leak
// from a KB delta.
const FORBIDDEN_SIGNATURES = ["recharts", "katex", "framer-motion", "@supabase/ssr"];

// ── Per-route cold-load measurement ─────────────────────────────────────
type RouteResult =
  | { path: string; ok: true; scriptKB: number; leaks: string[] }
  | { path: string; ok: false; reason: string };

type BrowserCookie = Awaited<ReturnType<import("@playwright/test").BrowserContext["cookies"]>>[number];

/** Signs `email` in through /login and returns the session cookies. */
async function signInCookies(
  browser: import("@playwright/test").Browser,
  origin: string,
  email: string,
): Promise<BrowserCookie[]> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await signInThroughForm(
      page,
      origin,
      email,
      `is missing on ${describeSupabaseUrl(servedSupabaseUrl)} (or has another password than the seed's). ` +
        `To measure it: ${SEED_HINT}, then run \`npm run budget:local\``,
    );
    return await context.cookies();
  } finally {
    await context.close();
  }
}

async function measureRoute(
  browser: import("@playwright/test").Browser,
  origin: string,
  path: string,
  guardForbiddenSignatures: boolean,
  cookies: BrowserCookie[] = [],
  phone = false,
  alsoForbid: string[] = [],
): Promise<RouteResult> {
  // A fresh, cache-disabled context per route: no storage and no cache
  // carried over from a previous route or a previous run. Cookies only for a
  // `signInAs` route, and only the session's.
  // A phone context (OPS-028) is the viewport and touch capabilities of the
  // owner's phone check (0175): coarse pointer, no hover, so the desktop-only
  // media queries do not match.
  const context = await browser.newContext(
    phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {},
  );
  if (cookies.length > 0) await context.addCookies(cookies);
  const page = await context.newPage();

  let pageError: string | undefined;
  page.on("pageerror", (err) => {
    if (!pageError) pageError = err.message;
  });

  const client: CDPSession = await context.newCDPSession(page);
  await client.send("Network.enable");

  const resourceTypeByRequestId = new Map<string, string>();
  const scriptUrlByRequestId = new Map<string, string>();
  let scriptBytes = 0;
  const bodyFetches: Promise<{ url: string; body: string } | undefined>[] = [];

  client.on("Network.responseReceived", (event) => {
    resourceTypeByRequestId.set(event.requestId, event.type);
    if (event.type === "Script") {
      scriptUrlByRequestId.set(event.requestId, event.response.url);
    }
  });
  client.on("Network.loadingFinished", (event) => {
    if (resourceTypeByRequestId.get(event.requestId) !== "Script") return;
    scriptBytes += event.encodedDataLength;
    if (!guardForbiddenSignatures) return;
    const url = scriptUrlByRequestId.get(event.requestId);
    if (!url) return;
    // Fetched while the response is still buffered by the CDP session (i.e.
    // before context.close() below), not re-requested over the network.
    bodyFetches.push(
      client
        .send("Network.getResponseBody", { requestId: event.requestId })
        .then((res) => ({ url, body: res.body }))
        .catch(() => undefined),
    );
  });

  try {
    const response = await page.goto(origin + path, {
      waitUntil: "networkidle",
      timeout: 15_000,
    });
    if (!response || !response.ok()) {
      return { path, ok: false, reason: `navigation returned ${response ? response.status() : "no response"}` };
    }
    // A redirect (a signed-out /my → /login) would measure another page.
    const landed = new URL(page.url()).pathname;
    if (landed !== path) {
      return { path, ok: false, reason: `redirected to ${landed}` };
    }
    if (pageError) {
      return { path, ok: false, reason: `page error: ${pageError}` };
    }

    const bodies = (await Promise.all(bodyFetches)).filter((b): b is { url: string; body: string } => b != null);
    const leaks: string[] = [];
    for (const { url, body } of bodies) {
      for (const signature of [...FORBIDDEN_SIGNATURES, ...alsoForbid]) {
        if (body.toLowerCase().includes(signature.toLowerCase())) {
          leaks.push(`${url} contains "${signature}"`);
        }
      }
    }

    return { path, ok: true, scriptKB: scriptBytes / 1024, leaks };
  } catch (e) {
    return { path, ok: false, reason: (e as Error).message };
  } finally {
    await context.close();
  }
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  let origin: string;
  let localProc: ChildProcess | undefined;

  if (urlOverride) {
    origin = urlOverride.replace(/\/$/, "");
    console.log(`Using existing server at ${origin}.`);
    console.log("Supabase: whatever that server was started with (not checked by --url).");
  } else {
    console.log(
      `Supabase: ${describeSupabaseUrl(servedSupabaseUrl)} (${useLocalStack ? "--local: the local stack" : "from the environment / .env.local"}).`,
    );
    const started = await startLocalServer(LOCAL_PORT, servedSupabaseUrl);
    origin = started.origin;
    localProc = started.proc;
  }

  const browser = await chromium.launch();
  let anyFailed = false;

  try {
    console.log("\nroute | KB | budget");
    console.log("-".repeat(40));
    for (const route of ROUTES) {
      let cookies: BrowserCookie[] = [];
      if (route.signInAs) {
        try {
          cookies = await signInCookies(browser, origin, route.signInAs);
        } catch (e) {
          anyFailed = true;
          console.log(`${route.path} | FAIL (sign-in as ${route.signInAs}: ${(e as Error).message.split("\n")[0]}) | ${route.budgetKB}`);
          continue;
        }
      }
      const result = await measureRoute(
        browser,
        origin,
        route.path,
        route.guardForbiddenSignatures,
        cookies,
        route.phone,
        route.alsoForbid,
      );
      if (!result.ok) {
        anyFailed = true;
        const hint =
          route.seeded && result.reason === "navigation returned 404"
            ? `; this route's data is seeded on the local stack only: ${SEED_HINT}, then run \`npm run budget:local\``
            : "";
        console.log(`${route.phone ? `${route.path} (phone)` : route.path} | FAIL (${result.reason}${hint}) | ${route.budgetKB}`);
        continue;
      }
      const kb = result.scriptKB;
      const overBudget = kb > route.budgetKB;
      if (overBudget) anyFailed = true;
      const label = route.phone ? `${route.path} (phone)` : route.path;
      console.log(
        // Exact bytes beside the KB: a route with tens of bytes of headroom is judged in bytes
        // (docs/decisions/0246).
        `${label} | ${kb.toFixed(1)} KB (${Math.round(kb * 1024)} B) | ${route.budgetKB} KB${overBudget ? "  ⚠ OVER BUDGET" : ""}`,
      );
      if (result.leaks.length > 0) {
        anyFailed = true;
        console.log(`  ⚠ FORBIDDEN-PACKAGE SIGNATURE${result.leaks.length > 1 ? "S" : ""} FOUND:`);
        for (const leak of result.leaks) console.log(`    - ${leak}`);
      }
    }
  } finally {
    await browser.close();
    if (localProc) {
      killProcessTree(localProc);
    }
  }

  if (anyFailed) {
    console.error("\nBudget guard failed: see routes marked FAIL or OVER BUDGET above.");
    process.exit(1);
  }
  console.log("\nAll routes within budget.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
