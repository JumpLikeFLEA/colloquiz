import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { SITE_URL } from "@/lib/site";
import { alliengllCopy } from "@/lib/alliengll/copy";
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
  title: {
    default: alliengllCopy.landing.heroTitle,
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

export default function EnglishRootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: the inline script below sets `class` before
    // hydration, so server and client markup necessarily disagree here —
    // same reasoning as the Colloquiz root layout.
    <html lang="ru" suppressHydrationWarning className={`${geistSans.variable} h-full antialiased`}>
      <body className="h-full">
        <script dangerouslySetInnerHTML={{ __html: darkModeScript }} />
        {children}
        {/* Kept per docs/decisions/0046: the only source of field Web
            Vitals, which is the evidence the Performance boundary's own
            budget requirement asks for. Cookieless, same as the Colloquiz
            root — see app/(colloquiz)/layout.tsx. <Analytics/> is a separate,
            still-open decision (OPS-008) and is NOT added here. */}
        <SpeedInsights />
      </body>
    </html>
  );
}
