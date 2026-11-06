/**
 * Duplicating a lesson or course (AUTH-022, docs/decisions/0214). Pure: which
 * lesson-images objects a copy needs of its own, and the old-URL -> new-URL map
 * migration 107's RPCs apply to the copied documents.
 *
 * Why a copy needs its own objects: the course delete route purges the whole
 * "<course_id>/" prefix of the bucket, so a copy pointing at the original's
 * objects would lose them when the original is deleted.
 */

import { extractLessonImageUrls, lessonImagePathFromUrl } from "./lessonImages";
import { UUID_RE } from "./ids";


export type ImageCopy = { url: string; from: string; to: string; newUrl: string };

/**
 * One planned object copy per distinct image URL in the given raw documents
 * (plus an optional cover URL), for a copy that will live under
 * `<targetCourseId>/`.
 *
 * Only objects under the SOURCE course's own prefix are planned: a document an
 * editor wrote could name any object in the bucket, and the service role that
 * performs the copy must never be steered at another course's images. A URL
 * that is not ours, or sits under another prefix, is left out and stays as it
 * is in the copy.
 */
export function planImageCopies(
  sourceCourseId: string,
  targetCourseId: string,
  documents: readonly unknown[],
  coverUrl: string | null | undefined,
  newName: () => string,
): ImageCopy[] {
  if (!UUID_RE.test(sourceCourseId) || !UUID_RE.test(targetCourseId)) {
    throw new Error("Refusing to plan image copies: not a course id");
  }
  const urls = new Set<string>();
  for (const doc of documents) for (const u of extractLessonImageUrls(doc)) urls.add(u);
  if (coverUrl) urls.add(coverUrl);

  const plan: ImageCopy[] = [];
  for (const url of urls) {
    const from = lessonImagePathFromUrl(url);
    if (!from) continue;
    const parts = from.split("/");
    if (parts.length !== 2 || parts[0] !== sourceCourseId || parts[1] === "" || parts[1] === ".." || parts[1] === ".") {
      continue;
    }
    const dot = parts[1].lastIndexOf(".");
    const ext = dot > 0 ? parts[1].slice(dot) : "";
    const to = `${targetCourseId}/${newName()}${ext}`;
    // Replace the path segment only; host, bucket and any query stay as the author stored them.
    const at = url.indexOf(from);
    const newUrl = url.slice(0, at) + to + url.slice(at + from.length);
    plan.push({ url, from, to, newUrl });
  }
  return plan;
}

/** The map the RPCs take: {old URL: new URL}. */
export function urlMapOf(plan: readonly ImageCopy[]): Record<string, string> {
  return Object.fromEntries(plan.map((p) => [p.url, p.newUrl]));
}
