/**
 * The three values Settings > Appearance offers, and the only three
 * profiles.theme_preference accepts (migration 025 constrains the column to the
 * same list — keep them in step).
 *
 * "system" is a real, storable choice, not the absence of one: a user who has
 * been on Dark and moves back to System has expressed a preference that should
 * propagate to their other devices. NULL in the database is the separate state
 * "never chosen", which leaves a device's existing setting alone.
 */
export const THEME_PREFERENCES = ["light", "dark", "system"] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/**
 * Anything unrecognised is treated as "never chosen" rather than coerced to a
 * default, so a stray value cannot silently flip somebody's theme.
 */
export function asThemePreference(value: unknown): ThemePreference | null {
  return typeof value === "string" && (THEME_PREFERENCES as readonly string[]).includes(value)
    ? (value as ThemePreference)
    : null;
}

/**
 * next-themes' default storage key. Colloquiz and Studio mount next-themes
 * (app/components/ThemeProvider.tsx) with no `storageKey`, so this is where
 * their choice lives; the English surface reads and writes the same key so a
 * learner's choice is one preference across all three (docs/decisions/0181).
 */
export const THEME_STORAGE_KEY = "theme";

/**
 * The English root layout's inline theme script (docs/decisions/0046, 0181).
 * It runs first in <body>, before anything paints, so `.dark` is on <html>
 * with no flash. It:
 *
 * 1. adopts `serverPreference` (profiles.theme_preference, read server-side
 *    for a signed-in learner) when it differs from this device's stored
 *    choice, and stores it: the cross-device read-back Colloquiz does a frame
 *    later in ThemeSync, done here before first paint because the layout
 *    already knows the value;
 * 2. applies `.dark` for "dark", and for "system", no choice or an
 *    unrecognised one, when the device prefers dark.
 *
 * `serverPreference` is re-validated and embedded with JSON.stringify, so the
 * only things that can reach the script are the three literals and `null`.
 * Each storage access is guarded on its own: with storage blocked, the server
 * preference still applies to this load.
 */
export function englishThemeScript(serverPreference: unknown): string {
  const p = JSON.stringify(asThemePreference(serverPreference));
  const k = JSON.stringify(THEME_STORAGE_KEY);
  return (
    `(function(p){var s=null;try{s=window.localStorage.getItem(${k})}catch(e){}` +
    `if(p&&p!==s){s=p;try{window.localStorage.setItem(${k},p)}catch(e){}}` +
    `try{if(s==='dark'||(s!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})(${p})`
  );
}
