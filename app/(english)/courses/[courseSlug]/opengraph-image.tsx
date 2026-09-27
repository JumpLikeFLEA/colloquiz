import { ImageResponse } from "next/og";
import { alliengllCopy } from "@/lib/alliengll/copy";
import { getPublicCourse } from "@/lib/coursePage";
import { OgImageCard } from "../ogImageCard";

// SHELL-009 — per-course share image (Telegram, VK, etc. all read og:image).
// A route-segment file, not the app-root app/opengraph-image.tsx: Next
// resolves the most specific opengraph-image in the segment tree, so this
// one wins for every /courses/[courseSlug] URL (docs/decisions/0046's
// "opengraph-image.tsx / icon files" note).
export const alt = alliengllCopy.siteName;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ courseSlug: string }>;
}) {
  const { courseSlug } = await params;
  const course = await getPublicCourse(courseSlug);

  // A course that doesn't resolve (bad/stale link) still gets a branded
  // card rather than a broken image — the page itself 404s separately.
  const title = course.state === "ok" ? course.title : alliengllCopy.landing.heroTitle;
  const description = course.state === "ok" ? course.description : alliengllCopy.landing.heroSubtitle;
  const coverImageUrl = course.state === "ok" ? course.coverImageUrl : null;
  const level = course.state === "ok" ? course.level : null;

  return new ImageResponse(
    <OgImageCard title={title} description={description} level={level} coverImageUrl={coverImageUrl} />,
    { ...size },
  );
}
