# design-sync notes — colloquiz

Repo-specific gotchas for future syncs. Read this before re-running.

## What is synced
- This repo is a **Next.js app**, not a component-library package. The synced design system is the
  **shadcn `ui/` primitives** in `app/components/ui/` (46 primitives), styled by the app's Tailwind v4
  tokens in `app/globals.css`.
- App composites (`SubjectGrid`, `Topbar`, `AppSidebar`, `NotificationBell`, …) are deliberately **out of
  scope** — they're Supabase/state-coupled and don't render standalone. Scope decided with the user 2026-07-20.

## Build pipeline (why it's not vanilla synth mode)
- There is no built component `dist/`, so this uses **synth-entry mode** for the JS bundle BUT a **vendored
  staging package** for real `.d.ts` prop contracts. `.design-sync/build-pkg.mjs` (= `cfg.buildCmd`):
  1. Copies `app/components/ui/*.tsx` + `lib/{utils,use-mobile}.ts` into `.ds-sync/pkg/src/`, rewriting the
     two `@/lib/*` imports to package-relative paths. Byte-identical otherwise — re-run each sync.
  2. Emits real `.d.ts` via `tsc --emitDeclarationOnly` → `.ds-sync/pkg/types/` (`~10` "cannot be named"
     diagnostics degrade a few radix props to `any`; non-fatal, expected).
  3. Compiles Tailwind (`@tailwindcss/postcss`) scanning `app/`, `lib/`, and `.design-sync/previews/` →
     `.ds-sync/pkg/compiled.css` (must live inside PKG_DIR because `cfg.cssEntry` is security-bounded there).
- **Package location**: the converter resolves the package at `node_modules/colloquiz`. `build-pkg.mjs`
  materializes the staging package there directly (a REAL dir, gitignored under `/node_modules`, recreated
  each run). No junction/symlink is used — an earlier junction approach went dangling because `build-pkg`
  rm's+recreates the target. If `node_modules/colloquiz` is missing, just re-run `build-pkg.mjs`.
  Note: pointing the converter at the **repo root** instead would make `findTypesRoot` pick the app's own
  root `types/`/`lib/` dirs (wrong) and collapse props to a catch-all — the staging pkg avoids that.
- **Order**: run `build-pkg.mjs` (= `cfg.buildCmd`) → run converter (`package-build.mjs`). `build-pkg`
  wipes+recreates `node_modules/colloquiz`, so always run it before the converter.

## Card curation
- `componentSrcMap` pins **46 primaries** (one per `ui/` file) and **nulls ~192 compound sub-parts**
  (`CardHeader`, `DialogTitle`, …). Nulled parts are still in the bundle (`window.Colloquiz.*`) — they just
  don't get their own card. All 238 exports remain importable.
- Special primaries: `chart.tsx`→`ChartContainer`, `resizable.tsx`→`ResizablePanelGroup`, `sonner.tsx`→`Toaster`.
- All cards land in group `general` (flat `ui/` dir gives no sub-grouping; `@category` JSDoc would edit app
  source, disallowed). Acceptable for 46 items; could improve later via docs frontmatter.

## Render check
- No playwright/chromium cache. Uses **system Chrome** via `DS_CHROMIUM_PATH`; playwright JS installed in
  `.ds-sync` with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` (no 200MB download). Set before validate:
  `export DS_CHROMIUM_PATH="/c/Program Files/Google/Chrome/Application/chrome.exe"`.

## Floor-card components (authored preview intentionally omitted)
- **Toaster** (sonner): an empty toast region can't render statically. Ships importable; floor card.
- **ResizablePanelGroup**: see Re-sync risks — the underlying component is broken in the app, so no preview.
- **ChartContainer**: recharts `ResponsiveContainer` reports 0 size under headless Chrome, so the chart
  renders blank. Ships importable with `.d.ts`+prompt; floor card. If a future run wants a chart preview,
  render recharts with an explicit `width`/`height` (bypassing ResponsiveContainer) or capture with a delay.

## Known render warns (triaged — a warn NOT listed here is new, investigate it)
- `[RENDER_BLANK]` on floor-card components above (Toaster, ResizablePanelGroup, ChartContainer): expected.
- **Calendar**: the weekday header row (`Su … Sa`) is misaligned — likely `app/components/ui/calendar.tsx`
  targets an older react-day-picker classNames API than the installed `react-day-picker@10`. The day grid,
  month nav, and selection render fine. Faithful to the app; a real app-side polish item, not a preview bug.
- **ContextMenu**: Radix ContextMenu has no controlled-open, so the preview shows the real trigger plus a
  detached styled menu (real `ContextMenuLabel`/`Separator`/`Shortcut`; item rows are plain divs since
  `ContextMenuItem` needs menu context). A pragmatic representation of the menu styling.

## Re-sync risks / watch-list
- **Staging is regenerated from live sources** by `build-pkg.mjs` — faithful, but if a `ui/` component gains a
  NEW `@/…` import beyond `@/lib/utils` / `@/lib/use-mobile`, add it to the import-rewrite map in build-pkg.mjs.
- **Junction is not committed** — recreate on every fresh clone.
- **Resizable**: `react-resizable-panels` `PanelGroup`/`PanelResizeHandle` resolve undefined under esbuild
  (namespace-import warning at bundle time). Verify Resizable renders; if broken, author a minimal preview or skip.
- **Geist font not shipped**: `--font-geist-sans`/`--font-geist-mono` are the 2 undefined tokens; the app loads
  Geist via `next/font` at runtime, so previews render in a system-sans fallback. Wire `cfg.extraFonts` if brand
  font match is required.
