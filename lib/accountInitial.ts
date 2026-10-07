/**
 * SHELL-019 (docs/decisions/0086) — the letter shown in the English
 * surface's account chip: the first character of the signed-in learner's
 * email, upper-cased. Null when there is nothing usable (no email in the
 * JWT, which a future non-email sign-in such as Telegram may produce), so
 * the chip falls back to a generic person icon instead of a blank circle.
 *
 * Pure, so it is unit-tested without a session.
 */
export function accountInitial(email: string | null): string | null {
  // Iterate by code point, not UTF-16 unit, so an address starting with an
  // astral character never renders half a surrogate pair.
  const first = email ? Array.from(email.trim())[0] : undefined;
  if (!first || first === "@") return null;
  return first.toLocaleUpperCase();
}
