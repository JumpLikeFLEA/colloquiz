// Validation for the editable profile fields in Settings > Account. Pure, so
// the form and the tests share one definition of what is acceptable.

export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 32;
export const FULL_NAME_MAX = 64;
export const CITY_MAX = 64;

/**
 * C0/C1 control characters and the Unicode line separators. A newline in a
 * display name breaks a leaderboard row; the rest are invisible. Ordinary
 * spaces, hyphens and accented letters are all fine.
 *
 * Written with escapes on purpose — the literal characters would make this
 * source file unreadable in a diff.
 */
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/;

/**
 * The public handle. Shown on leaderboards next to other people's, so it has
 * to be present and bounded; beyond that we do not police what someone calls
 * themselves. Returns a reason, or null when valid.
 */
export function validateDisplayName(raw: string): string | null {
  const value = raw.trim();
  if (value.length === 0) return "Display name can’t be empty.";
  if (value.length < DISPLAY_NAME_MIN) {
    return `Display name must be at least ${DISPLAY_NAME_MIN} characters.`;
  }
  if (value.length > DISPLAY_NAME_MAX) {
    return `Display name must be ${DISPLAY_NAME_MAX} characters or fewer.`;
  }
  if (CONTROL_CHARS.test(value)) return "Display name can’t contain control characters.";
  return null;
}

/** Optional, so only a length ceiling. Returns a reason, or null when valid. */
export function validateFullName(raw: string): string | null {
  const value = raw.trim();
  if (value.length > FULL_NAME_MAX) {
    return `Name must be ${FULL_NAME_MAX} characters or fewer.`;
  }
  if (CONTROL_CHARS.test(value)) return "Name can’t contain control characters.";
  return null;
}

/** Optional, so only a length ceiling. Returns a reason, or null when valid. */
export function validateCity(raw: string): string | null {
  const value = raw.trim();
  if (value.length > CITY_MAX) return `City must be ${CITY_MAX} characters or fewer.`;
  if (CONTROL_CHARS.test(value)) return "City can’t contain control characters.";
  return null;
}

export type ProfileFormValues = {
  displayName: string;
  fullName: string;
  city: string;
};

export type ProfileFormErrors = Partial<Record<keyof ProfileFormValues, string>>;

/** All field errors at once, so Save can report every problem rather than the first. */
export function validateProfileForm(values: ProfileFormValues): ProfileFormErrors {
  const errors: ProfileFormErrors = {};
  const displayName = validateDisplayName(values.displayName);
  if (displayName) errors.displayName = displayName;
  const fullName = validateFullName(values.fullName);
  if (fullName) errors.fullName = fullName;
  const city = validateCity(values.city);
  if (city) errors.city = city;
  return errors;
}

/** True when nothing has changed — lets Save stay disabled instead of writing a no-op. */
export function isProfileFormUnchanged(a: ProfileFormValues, b: ProfileFormValues): boolean {
  return (
    a.displayName.trim() === b.displayName.trim() &&
    a.fullName.trim() === b.fullName.trim() &&
    a.city.trim() === b.city.trim()
  );
}
