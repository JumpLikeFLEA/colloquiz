import path from "node:path";
import { defineConfig } from "vitest/config";

// Two projects under one `npm test`, per docs/decisions/0004-vitest-scope.md's
// own "what would make us revisit it": a suite that needs jsdom/React moves to
// its own project rather than loosening the "unit" project's `environment:
// "node"`. See docs/decisions/0036-auth003-editor-test-project.md.
//
// "unit": pure lib/ + scripts/ modules — no jsdom, no React rendering, no
// database. Unchanged from 0004.
//
// "editor": React Testing Library component tests for the authoring UI under
// app/ (AUTH-003 practice-item forms). jsdom environment, "@/" alias resolved
// to match tsconfig so these components can import the same way app code does.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["lib/**/*.test.{ts,tsx}", "scripts/**/*.test.{mjs,js,ts}"],
        },
      },
      {
        resolve: {
          alias: { "@": path.resolve(import.meta.dirname) },
        },
        test: {
          name: "editor",
          environment: "jsdom",
          include: ["app/**/*.test.{ts,tsx}"],
        },
      },
    ],
  },
});
