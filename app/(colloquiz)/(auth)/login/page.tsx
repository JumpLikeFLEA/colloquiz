import { loginNotice } from "@/lib/loginNotice";
import { AuthScreen } from "../AuthScreen";

// Exported so ResetPasswordScreen (SHELL-015) can show the identical copy
// inline instead of duplicating the string.
export const RECOVERY_EXPIRED_MESSAGE =
  "Your password reset link is invalid or has expired. Please request a new one via “Forgot password?”.";

const ERROR_MESSAGES: Record<string, string> = {
  confirm_expired:
    "Your confirmation link is invalid or has expired. Please sign in, or sign up again to receive a new link.",
  oauth: "Social sign-in failed. Please try again.",
  recovery_expired: RECOVERY_EXPIRED_MESSAGE,
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; next?: string }>;
}) {
  const { error, notice, next } = await searchParams;
  const initialError = error ? ERROR_MESSAGES[error] ?? null : null;
  // The English entry gets its own wording (docs/decisions/0181 Decision 6).
  const initialNotice = loginNotice(notice, next);

  return (
    <AuthScreen
      initialMode="login"
      initialError={initialError}
      initialNotice={initialNotice}
      redirectTo={next}
    />
  );
}
