/**
 * The English surface's error boundary strings (app/(english)/error.tsx),
 * in Russian. This is the ONE exception to "every learner-facing chrome
 * string lives in lib/alliengll/copy.ts" (docs/handoff.md, "Audience and
 * language"), and it exists for bundle size, not localisation.
 *
 * `error.tsx` must be a Client Component, and Next ships the error boundary
 * with every page in its segment. Importing copy.ts there put the whole
 * strings object (~2.2 KB gzip, measured from the built chunk) into the
 * client JS of `/` and the course page, which need none of it client-side.
 * That cost pushed `/` over its 180 KB budget the moment the course
 * redesign added strings (docs/decisions/0079, "Budget"). These four
 * strings are all the boundary needs.
 *
 * Still Russian-only, still no locale switching: this is one more file in
 * the same language, not an i18n layer.
 */
export const alliengllErrorCopy = {
  title: "Что-то пошло не так",
  body: "Попробуйте ещё раз — обычно это помогает.",
  retry: "Повторить",
  backHome: "На главную",
} as const;
