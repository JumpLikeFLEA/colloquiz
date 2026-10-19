/**
 * The rules both Settings pages apply to a sign-in method (Colloquiz's
 * `/app/settings` and Alina Cher's `/my/settings`, docs/decisions/0181), kept
 * in one place so the two lists can't disagree about who an identity is or
 * when Disconnect is refused. Pure, so it is tested in the "unit" project.
 */

/**
 * Who a connected identity is: its email, or for Telegram, which sends none,
 * its @username (docs/decisions/0098). Null when it carries neither.
 */
export function identityLabel(identityData: Record<string, unknown> | null | undefined): string | null {
  if (identityData?.email) return String(identityData.email);
  if (identityData?.preferred_username) return `@${String(identityData.preferred_username)}`;
  return null;
}

/**
 * THE RULE: the last remaining identity can never be disconnected. Counts
 * every identity, not only the ones a page renders: an account linked to a
 * provider no longer shown still has a way in, and unlinking a visible one
 * would not lock anybody out.
 */
export function isOnlySignInMethod(identityCount: number): boolean {
  return identityCount <= 1;
}
