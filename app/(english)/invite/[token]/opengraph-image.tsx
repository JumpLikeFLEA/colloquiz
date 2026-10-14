import { ImageResponse } from "next/og";
import { alliengllCopy } from "@/lib/alliengll/copy";
import { getPublicCourse } from "@/lib/coursePage";
import { getInvitePreview } from "@/lib/runInvitesServer";
import { OgImageCard } from "../../courses/ogImageCard";
import { inviteCopy } from "./inviteCopy";

// The invite link's share card (docs/decisions/0137): the course's cover,
// level, title and short summary (the course hero's lead) under a "You're invited" pill. The same for every invite
// state on purpose: Telegram caches a preview per URL, so a card that said
// "used" or "expired" would outlive the state that drew it. Fetching it
// spends nothing: run_invite_preview is a read, claiming is the page's POST
// button (docs/decisions/0107).
export const alt = alliengllCopy.siteName;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const preview = await getInvitePreview(token);
  const course = preview.state === "not_found" ? null : await getPublicCourse(preview.courseSlug);

  // A bad token, or a course the anon read can't see, still gets the
  // surface's own card rather than a broken image.
  if (!course || course.state !== "ok") {
    return new ImageResponse(
      <OgImageCard
        title={alliengllCopy.landing.heroTitle}
        description={alliengllCopy.landing.heroSubtitle}
        level={null}
        coverImageUrl={null}
      />,
      { ...size },
    );
  }

  return new ImageResponse(
    <OgImageCard
      eyebrow={inviteCopy.ogEyebrow}
      title={course.title}
      description={course.subtitle ?? course.description}
      level={course.level}
      coverImageUrl={course.coverImageUrl}
    />,
    { ...size },
  );
}
