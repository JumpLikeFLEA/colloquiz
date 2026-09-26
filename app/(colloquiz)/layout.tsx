import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "../components/ThemeProvider";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from "@/lib/site";
import "katex/dist/katex.min.css";
import "../globals.css";

// `subsets` is deliberately just ["latin"], unchanged from before SHELL-002 —
// see docs/decisions/0021. Google's css2 response for "Geist" always returns
// the font's full unicode-range split (cyrillic included) regardless of what
// `subsets` asks for; next/font's Google loader uses `subsets` ONLY to pick
// which of those @font-face buckets get an eager <link rel=preload>/Link
// header (next/dist/compiled/@next/font/dist/google/find-font-files-in-css.js).
// Adding "cyrillic" here does not add any glyph coverage that wasn't already
// present — it only adds a second font file, force-fetched on every route
// including ones with no Cyrillic text, which runs against the performance
// boundary (docs/handoff.md). The Cyrillic @font-face rule ships either way,
// so the browser still fetches it lazily, on demand, via its own unicode-range
// matching, the moment Alliengll content actually renders Cyrillic text — no
// system-font fallback occurs at any point. Coverage is PROVEN (not merely
// inferred from this reasoning) in docs/decisions/0021.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Used only on a handful of admin/quiz components (StageEditor, review
// queues, QuizSession, chart.tsx), all under the same root layout as
// everything else — no narrower layout to scope the font to instead.
// preload:false stops Next force-fetching this file on every route; it still
// loads normally (@font-face) the moment a font-mono element actually renders.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  // Absolute base for OG/canonical URLs. The icon, apple-icon and
  // opengraph-image files (app/icon.tsx etc.) are picked up automatically and
  // resolved against this.
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    // Per-page titles render as "Progress · Colloquiz"; the bare default above
    // is used where a page sets no title.
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  // Launch is public-but-unlisted; app/robots.ts carries the site-wide rule,
  // and this reinforces it at the page level for crawlers that read the tag.
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning is required, not cosmetic: next-themes' inline
    // script sets this element's `class` and `style.color-scheme` before React
    // hydrates, so the server HTML and the live DOM necessarily disagree here.
    // It is shallow — it covers this element's own attributes, nothing nested.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* ThemeProvider is the first thing in <body> so the script it renders
          ahead of its children is the first node the parser hits after <head>.
          Inline scripts block parsing, and the stylesheet in <head> already
          blocks first paint, so the theme class is on <html> before a single
          pixel is drawn. Moving this lower would open a paint window and
          reintroduce the flash. */}
      <body className="h-full">
        <ThemeProvider>{children}</ThemeProvider>
        {/* Cookieless by design — aggregate page views and Web Vitals only, no
            identifying cookie. This is what lets the launch skip a cookie
            banner (locked decision, DoR). */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
