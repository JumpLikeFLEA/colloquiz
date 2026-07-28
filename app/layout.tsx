import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "./components/ThemeProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Colloquiz",
  description: "Test your knowledge with interactive quizzes",
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
      </body>
    </html>
  );
}
