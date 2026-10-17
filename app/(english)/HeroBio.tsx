import Image from "next/image";
import { ArrowRight } from "lucide-react";
import type { SurfaceLang } from "@/lib/alliengll/surfaceLang";
import { landingCopy, SOCIAL_LINKS } from "./landingCopy";
import { InstagramIcon, YouTubeIcon } from "./SocialIcons";

/**
 * The hero's bio block: Alina's photo in a circle beside "**Alina.** <who she
 * is>", then the social row, a handwritten label and the Instagram and YouTube
 * links with their marks (SHELL-027, docs/decisions/0165; the words and the
 * icons are the owner's mockups, SHELL-031, docs/decisions/0167; links from
 * 0156 Decision 14). The photo is a 192px square crop of the owner's original,
 * served from `public/images/` through next/image; the 1080x1920 original
 * stays in docs/design/alina-cher/ and is never served.
 *
 * A Server Component rendered once per language by page.tsx, so it adds no
 * client JS to `/` (the `account` pattern, docs/decisions/0086). Only one
 * language's copy is in the page at a time, so the label's id is unique. The
 * links open in a new tab; each is a 44px-high target.
 */
const SOCIAL_LINK_CLASS =
  "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-brand-text underline decoration-2 underline-offset-4 outline-none hover:decoration-brand focus-visible:ring-2 focus-visible:ring-brand";

export function HeroBio({ lang }: { lang: SurfaceLang }) {
  const t = landingCopy[lang];
  const labelId = `hero-follow-label-${lang}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex max-w-md items-center gap-3">
        <Image
          src="/images/alina.jpg"
          alt=""
          width={48}
          height={48}
          className="size-12 flex-none rounded-full border-2 border-ink object-cover"
        />
        <p className="text-sm text-foreground">
          <span className="font-bold">{t.bio.name}</span> {t.bio.text}
        </p>
      </div>
      <nav aria-labelledby={labelId} className="flex flex-wrap items-center gap-x-1 gap-y-0">
        <span id={labelId} className="mr-1 inline-flex items-center gap-1.5 font-accent text-lg leading-tight text-foreground">
          {t.followLabel}
          <ArrowRight className="size-4 flex-none" aria-hidden="true" />
        </span>
        <a href={SOCIAL_LINKS.instagram} target="_blank" rel="noopener noreferrer" className={SOCIAL_LINK_CLASS}>
          <InstagramIcon className="size-4" />
          {t.instagram}
        </a>
        <a href={SOCIAL_LINKS.youtube} target="_blank" rel="noopener noreferrer" className={SOCIAL_LINK_CLASS}>
          <YouTubeIcon className="size-4" />
          {t.youtube}
        </a>
      </nav>
    </div>
  );
}
