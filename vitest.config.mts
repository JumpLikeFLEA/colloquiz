import { defineConfig } from "vitest/config";

// Pure modules only — no jsdom, no React rendering, no database.
// lib/**: pure lib/ modules (scoring, shuffleOptions, course content schemas, ...).
// scripts/**: pure Node scripts with their own tests (e.g. the context-guard hook
// decision function, OPS-002) — excluded from lib/ deliberately, since they are
// tooling, not app code, but they are equally pure and already wired to `npm test`.
// See docs/decisions/0004-vitest-scope.md.
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.{ts,tsx}", "scripts/**/*.test.{mjs,js,ts}"],
  },
});
