import { cookies } from "next/headers";
import { getPublicCourse } from "@/lib/coursePage";
import { firstFreeLesson } from "@/lib/coursePageProgress";
import { getPublishedCourses } from "@/lib/publicCatalogue";
import { getSignedInAccount } from "@/lib/signedInAccount";
import { parseSurfaceLang, SURFACE_LANG_COOKIE } from "@/lib/alliengll/surfaceLang";
import { AccountMenu } from "./AccountMenu";
import { GradientBackdrop, HeroChips, valueIcons } from "./HeroDecor";
import { LandingContent } from "./LandingContent";

/**
 * SHELL-010 — the landing page: header, hero, then the catalogue. Built
 * once, late (docs/handoff.md, "Visual work" §3's landing-page exception).
 * Data is fetched here, server-side; the EN/RU toggle and rendering live in
 * the Client Component `LandingContent`, whose strings come from
 * `./landingCopy.ts` — landing-page-only bilingual copy, kept separate from
 * `lib/alliengll/copy.ts` (still Russian-only, governs every other route;
 * docs/handoff.md, "Audience and language", 2026-09-28 landing exception).
 *
 * "From the bio link to the first free lesson takes at most one tap after /
 * loads" (acceptance): the hero's primary CTA does NOT go to the catalogue
 * first — it links straight to the FIRST published course's first
 * free-sample lesson (firstFreeLesson, the same SHELL-008 helper the course
 * page's own "one tap" CTA already uses), so tapping it once from `/` is a
 * complete reel-to-lesson path. Which course is "first" is
 * getPublishedCourses' created_at order; at one-course-today
 * (docs/handoff.md, "Launch bar") there is no ambiguity to resolve. The
 * catalogue below is still the secondary path, for a visitor who wants to
 * browse instead of jump straight in.
 */
export default async function EnglishLandingPage() {
  const courses = await getPublishedCourses();

  const featured = courses.length > 0 ? await getPublicCourse(courses[0].slug) : null;
  const heroLesson =
    featured && featured.state === "ok" ? firstFreeLesson(featured.lessons) : null;
  const heroHref = heroLesson ? `/courses/${courses[0].slug}/${heroLesson.slug}` : "#catalogue";

  // Read on the server so a returning visitor who picked RU gets it in the
  // FIRST response — no client-side re-render/flash, and no hydration
  // mismatch to work around (a useEffect+setState reading localStorage was
  // tried first and rejected: it flashed EN before correcting to the saved
  // RU choice, and the lint rule against setState-in-effect is right that
  // it's the wrong tool here). The cookie is set by the shared
  // LanguageToggle (here or on a course page, docs/decisions/0080);
  // defaults to "en" (2026-09-28 owner call) for a first-time visitor.
  const initialLang = parseSurfaceLang((await cookies()).get(SURFACE_LANG_COOKIE)?.value);

  // SHELL-019 (docs/decisions/0086): resolved here, server-side, so `/`
  // ships no session-reading JS. Both languages are rendered so the
  // landing's client-side toggle can switch the menu with the rest of the
  // page, the same way the root layout hands EnglishFooterGate both footers.
  const signedIn = await getSignedInAccount();
  const account = signedIn
    ? {
        en: <AccountMenu email={signedIn.email} lang="en" next="/" />,
        ru: <AccountMenu email={signedIn.email} lang="ru" next="/" />,
      }
    : null;

  return (
    // flex-1 (not min-h-svh): the root layout's wrapper div already sizes
    // itself to fill the viewport-minus-footer space (EnglishFooterGate
    // renders null on this route, so that's the whole viewport here).
    // flex-1 + flex-col lets THIS <main> stretch to fill that wrapper and
    // hand the space down to LandingContent's own flex layout, which is
    // what pushes the footer (rendered inside main, unlike every other
    // route's EnglishFooter) to the bottom without forcing a scrollbar.
    <main className="flex flex-1 flex-col bg-background">
      <LandingContent
        courses={courses}
        heroHref={heroHref}
        initialLang={initialLang}
        backdrop={<GradientBackdrop />}
        heroChips={<HeroChips />}
        valueIcons={valueIcons()}
        account={account}
      />
    </main>
  );
}
