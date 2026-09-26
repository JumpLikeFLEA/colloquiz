import Link from "next/link";
import { GraduationCap } from "lucide-react";

/**
 * Public shell for the legal pages (`/terms`, `/privacy`, `/subprocessors`).
 * Readable signed in and out — the proxy allow-lists these routes. No Figma
 * source exists for this surface; it is composed entirely from classes already
 * in use (the AuthScreen logo chip, border/muted tokens, the max-width reading
 * column), the same precedent as NotificationBell and the Groups surface.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            {/* Decorative gradient chip — the same theme-exempt brand mark used
                in AuthScreen's mobile logo. */}
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-brand-accent">
              <GraduationCap size={16} className="text-white" />
            </div>
            <span className="font-semibold text-foreground">Colloquiz</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/terms" className="text-muted-foreground transition-colors hover:text-foreground">
              Terms
            </Link>
            <Link href="/privacy" className="text-muted-foreground transition-colors hover:text-foreground">
              Privacy
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 px-6 py-6 text-sm text-muted-foreground">
          <span>© 2026 Colloquiz</span>
          <Link href="/terms" className="transition-colors hover:text-foreground">
            Terms of Service
          </Link>
          <Link href="/privacy" className="transition-colors hover:text-foreground">
            Privacy Policy
          </Link>
          <Link href="/subprocessors" className="transition-colors hover:text-foreground">
            Subprocessors
          </Link>
        </div>
      </footer>
    </div>
  );
}
