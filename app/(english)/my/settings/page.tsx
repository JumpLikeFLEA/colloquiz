import type { Metadata } from "next";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { UserIdentity } from "@supabase/supabase-js";
import { parseSurfaceLang, SURFACE_LANG_COOKIE } from "@/lib/alliengll/surfaceLang";
import { authUserFrom } from "@/lib/auth";
import type { OAuthProvider } from "@/lib/authRedirect";
import { isOAuthProviderAvailable } from "@/lib/inAppBrowser";
import { getSignedInAccount } from "@/lib/signedInAccount";
import { createClient } from "@/lib/supabase/server";
import { getThemePreference } from "@/lib/themePreferenceServer";
// Direct path, not the lesson-player barrel (docs/decisions/0059).
import { LESSON_HEADER_COLUMN_CLASS } from "@/app/components/lesson-player/columnLayout";
import { AccountMenu } from "../../AccountMenu";
import { BandTopBar } from "../../BandTopBar";
import { SectionHeading } from "../../SectionHeading";
import { HERO_ENTER_CLASS, PAPER_PILL_HIGHLIGHT_CLASS } from "../../surfaceClasses";
import { AppearanceSettings } from "./AppearanceSettings";
import { DataPrivacySettings } from "./DataPrivacySettings";
import { SignInMethods } from "./SignInMethods";
import { settingsCopy } from "./settingsCopy";

export async function generateMetadata(): Promise<Metadata> {
  const lang = parseSurfaceLang((await cookies()).get(SURFACE_LANG_COOKIE)?.value);
  return { title: settingsCopy[lang].metaTitle, robots: { index: false } };
}

const OAUTH_PROVIDERS: OAuthProvider[] = ["google", "discord", "custom:telegram"];

/**
 * The learner's settings on the English surface (docs/decisions/0181): the
 * theme, sign-in methods, and data export and account deletion, the parts of
 * Colloquiz's `/app/settings` that apply to an Alina Cher learner, reached
 * from the account card's "Settings" without leaving this surface (0062:
 * the footer stays the only path to /app). The chrome follows the saved
 * EN/RU choice with no toggle of its own, like `/my` (0120).
 *
 * Everything that decides is elsewhere: the identities come from Supabase
 * Auth, the theme from profiles.theme_preference (the same cached read the
 * root layout made), export and deletion from their API routes. The user
 * agent only decides which Connect buttons to offer (lib/inAppBrowser.ts).
 *
 * Signed out: proxy.ts sends `/my/*` to /login?next=...; the redirect below is
 * the same rule for a session that lapses between the proxy and the page.
 */
export default async function MySettingsPage() {
  const supabase = await createClient();
  const [user, signedIn] = await Promise.all([authUserFrom(supabase), getSignedInAccount()]);
  if (!user || !signedIn) redirect(`/login?${new URLSearchParams({ next: "/my/settings" }).toString()}`);

  const [identityResult, themePreference, langCookie, requestHeaders] = await Promise.all([
    supabase.auth.getUserIdentities(),
    getThemePreference(),
    cookies(),
    headers(),
  ]);
  // A failure degrades to an empty list with the reason shown, which keeps the
  // last-method guard on rather than off (the Colloquiz page's rule).
  const identities: UserIdentity[] = identityResult.data?.identities ?? [];
  const identityError = identityResult.error?.message ?? null;
  const lang = parseSurfaceLang(langCookie.get(SURFACE_LANG_COOKIE)?.value);
  const s = settingsCopy[lang];
  const userAgent = requestHeaders.get("user-agent");
  const available = Object.fromEntries(
    OAUTH_PROVIDERS.map((p) => [p, isOAuthProviderAvailable(p, userAgent)]),
  ) as Record<OAuthProvider, boolean>;

  return (
    // The Alina Cher grid paper (SHELL-033, docs/decisions/0192).
    <main className="grid-paper">
      <section>
        <div className={`${LESSON_HEADER_COLUMN_CLASS} relative flex flex-col gap-8 pb-8 pt-5 sm:pb-10 lg:pt-6`}>
          <BandTopBar
            tone="paper"
            back={{ href: "/my", label: s.backToMy }}
            // Sign-out from here returns to `/`: `/my/settings` would only
            // bounce a signed-out visitor to the sign-in page.
            account={<AccountMenu email={signedIn.email} username={signedIn.username} studio={signedIn.isEditor} unread={signedIn.unreadMessages} lang={lang} next="/" tone="paper" />}
          />
          <div className={`${HERO_ENTER_CLASS} flex flex-col items-start gap-3`}>
            <span className={PAPER_PILL_HIGHLIGHT_CLASS}>{s.eyebrow}</span>
            <h1 className="text-balance font-display text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">{s.title}</h1>
            <p className="max-w-xl text-base text-muted-foreground sm:text-lg">{s.lead}</p>
          </div>
        </div>
      </section>

      <div className={`${LESSON_HEADER_COLUMN_CLASS} flex w-full flex-col gap-12 pb-12 pt-4 sm:gap-16 sm:pb-16`}>
        <section className="flex flex-col gap-6" data-settings="appearance">
          <SectionHeading display title={s.appearanceTitle} />
          <p className="-mt-3 text-sm text-muted-foreground">{s.appearanceLead}</p>
          <AppearanceSettings userId={user.id} initialPreference={themePreference} labels={s.appearance} />
        </section>

        <section className="flex flex-col gap-6" data-settings="sign-in">
          <SectionHeading display title={s.signInTitle} />
          <p className="-mt-3 text-sm text-muted-foreground">{s.signInLead}</p>
          <SignInMethods identities={identities} loadError={identityError} available={available} labels={s.signIn} />
        </section>

        {/* Last and set apart, as on the Colloquiz page: these are rights, not
            preferences, and the destructive half must never read as one more
            row of settings. */}
        <section className="flex flex-col gap-6 border-t-2 border-ink pt-12" data-settings="data">
          <SectionHeading display title={s.dataTitle} />
          <p className="-mt-3 text-sm text-muted-foreground">{s.dataLead}</p>
          <DataPrivacySettings labels={s.data} />
          <p className="text-xs text-muted-foreground">
            {s.legalPrefix}{" "}
            <Link href="/terms" className="text-brand-text hover:underline">{s.legalTerms}</Link>{" "}
            {s.legalJoiner}{" "}
            <Link href="/privacy" className="text-brand-text hover:underline">{s.legalPrivacy}</Link>.
          </p>
        </section>
      </div>
    </main>
  );
}
