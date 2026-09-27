import { ImageResponse } from "next/og";
import { alliengllCopy } from "@/lib/alliengll/copy";
import { getPublicCourse } from "@/lib/coursePage";
import { getPublicLesson } from "@/lib/publicLesson";
import { OgImageCard } from "../../ogImageCard";

// SHELL-009 — per-lesson share image. Reuses the course's cover/level (a
// lesson has neither of its own) alongside the lesson's own title/
// description — both calls are cheap, RLS-scoped reads, same as the page
// itself. Preview metadata (title/description) is visible for every lesson
// regardless of entitlement (docs/handoff.md, "Preview, precisely"), so the
// "not_available" (paid, not bought) state still gets a real card, not a
// placeholder — that gate only ever applies to lesson CONTENT.
export const alt = alliengllCopy.siteName;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ courseSlug: string; lessonSlug: string }>;
}) {
  const { courseSlug, lessonSlug } = await params;
  const [course, lesson] = await Promise.all([
    getPublicCourse(courseSlug),
    getPublicLesson(courseSlug, lessonSlug),
  ]);

  const title = lesson.state === "not_found" ? alliengllCopy.landing.heroTitle : lesson.title;
  const description =
    lesson.state === "not_found" ? alliengllCopy.landing.heroSubtitle : lesson.description;
  const coverImageUrl = course.state === "ok" ? course.coverImageUrl : null;
  const level = course.state === "ok" ? course.level : null;

  return new ImageResponse(
    <OgImageCard title={title} description={description} level={level} coverImageUrl={coverImageUrl} />,
    { ...size },
  );
}
