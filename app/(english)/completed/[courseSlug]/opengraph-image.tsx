import { ImageResponse } from "next/og";
import { alliengllCopy } from "@/lib/alliengll/copy";
import { getPublicCourse } from "@/lib/coursePage";
import { OgImageCard } from "../../courses/ogImageCard";
import { landingShareText } from "../../landingCopy";
import { completedOgEyebrow } from "./completedCopy";

// PROG-008 (docs/decisions/0209): the course-complete share card, the course
// card (SHELL-009) under a "Course complete" pill. No score and no name: the
// URL is shared by every learner who finishes the course (0209 Decision 5).
export const alt = alliengllCopy.siteName;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ courseSlug: string }> }) {
  const { courseSlug } = await params;
  const course = await getPublicCourse(courseSlug);

  if (course.state !== "ok") {
    const share = landingShareText();
    return new ImageResponse(
      <OgImageCard title={share.title} description={share.description} level={null} coverImageUrl={null} />,
      { ...size },
    );
  }

  return new ImageResponse(
    <OgImageCard
      eyebrow={completedOgEyebrow}
      title={course.title}
      description={course.subtitle ?? course.description}
      level={course.level}
      coverImageUrl={course.coverImageUrl}
    />,
    { ...size },
  );
}
