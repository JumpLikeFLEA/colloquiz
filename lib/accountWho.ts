/**
 * Who the signed-in account is, as the English surface names it (SHELL-024,
 * SHELL-039): the email, else "@username" (a Telegram account has no email),
 * else null, which the caller renders as "You are signed in". Pure.
 */
export function accountWho(account: { email: string | null; username: string | null }): string | null {
  return account.email ?? (account.username ? `@${account.username}` : null);
}
