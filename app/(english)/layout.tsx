import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { Geist } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { SITE_URL } from "@/lib/site";
import { alliengllCopy } from "@/lib/alliengll/copy";
import { pageLangForPath, parseSurfaceLang, SURFACE_LANG_COOKIE } from "@/lib/alliengll/surfaceLang";
import { PATHNAME_HEADER } from "@/lib/requestPath";
import { EnglishFooter } from "./EnglishFooter";
import { EnglishFooterGate } from "./EnglishFooterGate";
import { EntryViewBeacon } from "./EntryViewBeacon";
import { HtmlLangSync } from "./HtmlLang";
import "../globals.css";

// Same font, same rationale as the Colloquiz root (docs/decisions/0021):
// `subsets: ["latin"]` costs no Cyrillic coverage — Google's css2 response
// always includes the cyrillic @font-face block regardless of `subsets`,
// which only controls the eager <link rel=preload>. Geist Mono is NOT loaded
// here: nothing under this surface renders monospace text (docs/decisions/0046).
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // "Alliengll" here is the browser-tab title, same literal display text as
  // LandingHeader.tsx's wordmark (docs/ui-decisions.md, 2026-09-28 landing
  // rebuild entry) — not a branding decision; alliengllCopy.siteName stays
  // "Colloquiz".
  title: {
    default: "Alliengll",
    template: `%s · ${alliengllCopy.siteName}`,
  },
  description: alliengllCopy.landing.heroSubtitle,
  robots: { index: false, follow: false },
};

// No ThemeProvider on this surface (docs/decisions/0046): there is no toggle,
// only a system-preference read. This inline script runs before first paint —
// the same "first thing after <head>, before any other body content" position
// next-themes itself uses — so `.dark` (globals.css's dark-token selector) is
// on <html> before a pixel is drawn, with no flash. Kept dependency-free and
// tiny on purpose: this is the whole cost of dark mode on this surface.
const darkModeScript = `(function(){try{if(window.matchMedia('(prefers-color-scheme: dark)').matches){document.documentElement.classList.add('dark')}}catch(e){}})()`;

export default async function EnglishRootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The saved EN/RU choice, for the course page's footer (docs/decisions/
  // 0080). Reading cookies here costs nothing extra: every route under this
  // layout is already dynamic (each reads the Supabase session cookies).
  // It stays current because the toggle saves through a Server Action,
  // which re-renders the layout too, not just the page.
  const savedLang = parseSurfaceLang((await cookies()).get(SURFACE_LANG_COOKIE)?.value);
  // The page's chrome language on a full load (SHELL-018, docs/decisions/
  // 0091). The path comes from proxy.ts; HtmlLangSync keeps it current
  // across client-side navigation, which this layout doesn't re-render for.
  const lang = pageLangForPath((await headers()).get(PATHNAME_HEADER) ?? "", savedLang);

  return (
    // suppressHydrationWarning: the inline script below sets `class` before
    // hydration, so server and client markup necessarily disagree here —
    // same reasoning as the Colloquiz root layout. It also covers `lang`,
    // which HtmlLang.tsx may set after load.
    <html lang={lang} suppressHydrationWarning className={`${geistSans.variable} h-full antialiased`}>
      {/* flex column + min-h-svh here (not on any page's own <main>) is the
          one sticky-footer anchor for the whole surface: the wrapper below
          grows (flex-1) to fill whatever's left of the viewport after
          EnglishFooterGate's natural height, so short content pushes the
          footer to the bottom without forcing a scrollbar, and long content
          just pushes the wrapper past 100svh as normal. A page's own <main>
          reintroducing min-h-svh double-forces height against this and was
          the earlier landing-page bug (docs/ui-decisions.md, 2026-09-28) —
          don't add it back on any page under this layout. */}
      <body className="flex min-h-svh flex-col">
        <script dangerouslySetInnerHTML={{ __html: darkModeScript }} />
        <EntryViewBeacon />
        <div className="flex flex-1 flex-col">{children}</div>
        <HtmlLangSync savedLang={savedLang} />
        <EnglishFooterGate savedLang={savedLang} ru={<EnglishFooter lang="ru" />} en={<EnglishFooter lang="en" />} />
        {/* Kept per docs/decisions/0046: the only source of field Web
            Vitals, which is the evidence the Performance boundary's own
            budget requirement asks for. Cookieless, same as the Colloquiz
            root — see app/(colloquiz)/layout.tsx. <Analytics/> (Vercel Web
            Analytics pageviews) is deliberately NOT added here — OPS-008
            (docs/decisions/0069) chose a first-party funnel_events table
            instead, since custom events require a Pro/Enterprise plan this
            project isn't on. */}
        <SpeedInsights />
      </body>
    </html>
  );
}
