import { AuthScreen } from "../AuthScreen";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <AuthScreen initialMode="register" redirectTo={next} />;
}
