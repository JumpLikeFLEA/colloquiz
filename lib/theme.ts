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
