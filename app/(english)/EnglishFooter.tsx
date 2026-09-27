import Link from "next/link";
import { alliengllCopy } from "@/lib/alliengll/copy";

/**
 * SHELL-012: the ONLY link from the English surface to /app (docs/handoff.md,
 * "Open questions" — a footer link only, no toggle, no nav entry). Rendered
 * from the root layout so it appears on every page under app/(english)/
 * without each page wiring it in. Not shared with Colloquiz — same "nothing
 * here is imported outside app/(english)/" boundary as lib/alliengll/copy.ts.
 */
export function EnglishFooter() {
  return (
    <footer className="border-t border-border py-6 text-center">
      <Link
        href="/app"
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {alliengllCopy.footer.colloquizLink}
      </Link>
    </footer>
  );
}
