import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import type { SurfaceLang } from "@/lib/alliengll/surfaceLang";
import { landingCopy, SOCIAL_LINKS } from "./landingCopy";

/**
 * The hero's bio line: Alina's photo in a circle, who makes the courses, and
 * the social row (SHELL-027, docs/decisions/0165; links from 0156 Decision 14).
 * The photo is a 192px square crop of the owner's original, served from
 * `public/images/` through next/image; the 1080x1920 original stays in
 * docs/design/alina-cher/ and is never served.
 *
 * A Server Component rendered once per language by page.tsx, so it adds no
 * client JS to `/` (the `account` pattern, docs/decisions/0086). The links
 * open in a new tab; each is a 44px-high target.
 */
const SOCIAL_LINK_CLASS =
  "inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-brand-text underline decoration-2 underline-offset-4 outline-none hover:decoration-brand focus-visible:ring-2 focus-visible:ring-brand";

export function HeroBio({ lang }: { lang: SurfaceLang }) {
  const t = landingCopy[lang];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <div className="flex items-center gap-3">
        <Image
          src="/images/alina.jpg"
          alt=""
          width={48}
          height={48}
          className="size-12 flex-none rounded-full border-2 border-ink object-cover"
        />
        <span className="text-sm font-medium text-foreground">{t.bio}</span>
      </div>
      <nav aria-label={t.followLabel} className="flex items-center gap-1">
        <a href={SOCIAL_LINKS.instagram} target="_blank" rel="noopener noreferrer" className={SOCIAL_LINK_CLASS}>
          {t.instagram}
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </a>
        <a href={SOCIAL_LINKS.youtube} target="_blank" rel="noopener noreferrer" className={SOCIAL_LINK_CLASS}>
          {t.youtube}
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </a>
      </nav>
    </div>
  );
}
