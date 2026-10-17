import { ImageResponse } from "next/og";
import { alliengllCopy } from "@/lib/alliengll/copy";
import { OgImageCard } from "./courses/ogImageCard";
import { landingShareText } from "./landingCopy";

// The English surface's default share card (docs/decisions/0137): `/` (the
// bio link), /my, /runs/* and any English route without a card of its own.
// Without it those routes fell back to app/opengraph-image.tsx, the
// Colloquiz quiz card. Course, lesson and invite routes have their own,
// more specific card.
export const alt = alliengllCopy.siteName;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  const share = landingShareText();
  return new ImageResponse(
    <OgImageCard
      title={share.title}
      description={share.description}
      level={null}
      coverImageUrl={null}
    />,
    { ...size },
  );
}
