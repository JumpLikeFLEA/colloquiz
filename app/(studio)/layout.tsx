import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "../components/ThemeProvider";
import { Toaster } from "../components/ui/sonner";
import { SITE_URL } from "@/lib/site";
import "../globals.css";

// Studio's root layout (SHELL-020, docs/decisions/0109 Decisions 2 and 11),
// the third beside (colloquiz) and (english). It carries what the course
// editor needs and nothing else: ThemeProvider (ui/sonner's Toaster reads
// next-themes) and the Toaster the editor's actions report through. No KaTeX
// CSS, no Vercel Analytics/Speed Insights, nothing from the Colloquiz shell.
//
// Fonts as in the Colloquiz root (docs/decisions/0021 for `subsets`). Geist
// Mono is loaded with preload:false because the moved editor pages use
// `font-mono` (slugs, the visitor-view path) and must render as they did;
// it is only fetched when such an element renders.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Studio",
    template: "%s · Studio",
  },
  robots: { index: false, follow: false },
};

export default function StudioRootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: next-themes sets `class` on <html> before
    // hydration — same reasoning as the Colloquiz root layout.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* ThemeProvider first in <body> so its theme script runs before
          paint (see app/(colloquiz)/layout.tsx). */}
      <body className="h-full">
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
