import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { alliengllCopy } from "@/lib/alliengll/copy";

/**
 * The icon-only "back to the course" link at the start of the sticky
 * progress strip (docs/decisions/0079 D5). It exists so a learner deep in
 * a lesson can leave without scrolling back to the band. Rendered
 * server-side by page.tsx and passed down as a node, so the icon costs no
 * client JS. The accessible name is the band's own "Back to course" text.
 */
export function StripBackLink({ courseSlug }: { courseSlug: string }) {
  return (
    <Link
      href={`/courses/${courseSlug}`}
      aria-label={alliengllCopy.player.backToCourse}
      className="-ml-2 flex size-11 flex-none items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand"
    >
      <ArrowLeft className="size-5" aria-hidden="true" />
    </Link>
  );
}
