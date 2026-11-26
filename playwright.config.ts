/**
 * Phone engines in Playwright (OPS-045, docs/decisions/0247).
 *
 * The owner has no iOS or Android test devices (docs/decisions/0246 Decision 6),
 * so phone behaviour is checked in the two engines phones run:
 *   - webkit-iphone: WebKit, the engine of iOS Safari and every iOS in-app browser;
 *   - chromium-pixel: Chromium, the engine of Android Chrome and Android in-app browsers.
 * Both at 360px wide, with the descriptor's touch, mobile and user-agent settings
 * kept. A pass is evidence about the engines, not about a phone.
 *
 * Run through `npm run e2e` (scripts/e2e.ts), which builds and serves against
 * the seeded local stack and passes the origin in E2E_BASE_URL. Not CI.
 */

import { defineConfig, devices } from "@playwright/test";

/** The width every phone project is measured at (CLAUDE.md: UI is measured at 360px). */
export const PHONE_WIDTH = 360;

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:4174";

/** A device descriptor with only the viewport width changed. */
function at360(device: (typeof devices)[string]) {
  return { ...device, viewport: { ...device.viewport, width: PHONE_WIDTH } };
}

export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e/.results",
  // One worker: a laptop runs this beside `next start`, and parallel browser
  // processes have taken this machine down before.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    // Signs each fixture in through the login form, fresh every run, and writes
    // its storage state to e2e/.auth/ (gitignored).
    { name: "setup", testMatch: /auth\.setup\.ts$/ },
    { name: "webkit-iphone", use: at360(devices["iPhone 13"]), dependencies: ["setup"] },
    { name: "chromium-pixel", use: at360(devices["Pixel 7"]), dependencies: ["setup"] },
  ],
});
