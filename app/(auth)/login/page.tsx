import { AuthScreen } from "../AuthScreen";

const ERROR_MESSAGES: Record<string, string> = {
  confirm_expired:
    "Your confirmation link is invalid or has expired. Please sign in, or sign up again to receive a new link.",
  oauth: "Google sign-in failed. Please try again.",
  recovery_expired:
    "Your password reset link is invalid or has expired. Please request a new one via “Forgot password?”.",
};

const NOTICE_MESSAGES: Record<string, string> = {
  confirmed_sign_in: "Your email has been confirmed. Please sign in with your password.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; next?: string }>;
}) {
  const { error, notice, next } = await searchParams;
  const initialError = error ? ERROR_MESSAGES[error] ?? null : null;
  const initialNotice = notice ? NOTICE_MESSAGES[notice] ?? null : null;

  return (
    <AuthScreen
      initialMode="login"
      initialError={initialError}
      initialNotice={initialNotice}
      redirectTo={next}
    />
  );
}
