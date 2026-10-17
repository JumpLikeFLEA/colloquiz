/**
 * Landing-page bilingual strings (docs/handoff.md, "Audience and language",
 * 2026-09-28 landing exception; the toggle is shared with the course pages
 * since docs/decisions/0080, whose own strings live in
 * courses/[courseSlug]/courseCopy.ts). Deliberately separate from
 * lib/alliengll/copy.ts — do not merge them, and do not import this file
 * outside app/(english)/page.tsx and its landing components, except for
 * `landingShareText` in the server-only metadata and share cards (SHELL-032,
 * docs/decisions/0168).
 *
 * Every claim below is one docs/handoff.md already makes about the product
 * (lesson length, levels, free first lessons, explanations, ~1 hour per
 * course, a percentage rather than pass/fail) — no learner counts or other
 * figures that nothing measures (docs/decisions/0078). The hero, the bio,
 * the social row and the comic panel are word for word the owner's mockups
 * (docs/design/alina-cher/owner-landing-hero-*.png, SHELL-031,
 * docs/decisions/0167), and "10+ лет" / "10+ years" is the owner's own claim
 * about Alina. The Russian copy addresses the learner as "ты" (0167).
 */

import type { SurfaceLang } from "@/lib/alliengll/surfaceLang";
import type { PluralForms } from "@/lib/pluralCategory";

/**
 * The brand tagline, "английский с умом" (docs/decisions/0156 Decision 11).
 * Russian in both locales, as in the owner's English mockup.
 */
export const TAGLINE = "английский с умом";

/** Alina's public profiles (docs/decisions/0156 Decision 14). */
export const SOCIAL_LINKS = {
  instagram: "https://www.instagram.com/alliengll/",
  youtube: "https://www.youtube.com/@AlinaCherBlog",
} as const;

type LandingStrings = {
  wordmark: string;
  login: string;
  navCourses: string;
  languageGroupLabel: string;
  /**
   * The headline, in reading order: `lead`, then `marker` on the yellow
   * marker, `middle`, then `oval` inside the hand-drawn oval.
   */
  heroTitle: { lead: string; marker: string; middle: string; oval: string };
  heroSubtitle: string;
  ctaPrimary: string;
  catalogueLink: string;
  /** `name` is set in bold, then `text`. */
  bio: { name: string; text: string };
  followLabel: string;
  instagram: string;
  youtube: string;
  comic: {
    head: string;
    speak: string;
    um: string;
    /** The sticker: `figure` large, `unit` small under it. */
    sticker: { figure: string; unit: string };
    /** The line under the panel. */
    note: string;
  };
  catalogueEyebrow: string;
  coursesHeading: string;
  catalogueSubtitle: string;
  courses: PluralForms;
  lessons: PluralForms;
  minutes: string;
  empty: string;
  stepsEyebrow: string;
  stepsHeading: string;
  stepsSubtitle: string;
  steps: { title: string; text: string }[];
  closingTitle: string;
  closingText: string;
};

export const landingCopy: Record<SurfaceLang, LandingStrings> = {
  ru: {
    wordmark: "Alina Cher",
    login: "Войти",
    navCourses: "Курсы",
    languageGroupLabel: "Язык",
    heroTitle: { lead: "Ты знаешь", marker: "больше", middle: ", чем можешь", oval: "сказать" },
    heroSubtitle: "Короткие курсы, которые переводят знания в речь.",
    ctaPrimary: "Начать бесплатно",
    catalogueLink: "Все курсы",
    bio: {
      name: "Алина.",
      text: "10+ лет помогаю взрослым заговорить свободно и создаю brain-friendly обучение.",
    },
    followLabel: "где я ещё рассказываю про мозг и язык",
    instagram: "Instagram",
    youtube: "YouTube",
    comic: {
      head: "английский в моей голове",
      speak: "английский, когда говорю",
      um: "ээ...мм",
      sticker: { figure: "10–15", unit: "минут в день" },
      note: "это нормально: понимать и говорить — разные навыки",
    },
    catalogueEyebrow: "Каталог",
    coursesHeading: "Курсы",
    catalogueSubtitle: "Около часа на курс — его можно пройти за неделю.",
    courses: { one: "курс", few: "курса", many: "курсов", other: "курса" },
    lessons: { one: "урок", few: "урока", many: "уроков", other: "урока" },
    minutes: "мин",
    empty: "Курсы скоро появятся — загляни позже.",
    stepsEyebrow: "Как это устроено",
    stepsHeading: "Скажи, услышь, сравни",
    stepsSubtitle: "Голосовые задания есть в курсах с потоком.",
    steps: [
      { title: "Запиши голос", text: "Ответь на голосовое задание вслух, прямо с телефона." },
      { title: "Получи отклик", text: "Автор послушает твою запись и ответит письменно." },
      { title: "Сравни", text: "В конце запиши тот же ответ ещё раз и услышь разницу." },
    ],
    closingTitle: "Первый урок — в одно касание",
    closingText: "Без регистрации и без оплаты.",
  },
  en: {
    wordmark: "Alina Cher",
    login: "Log in",
    navCourses: "Courses",
    languageGroupLabel: "Language",
    heroTitle: { lead: "You know", marker: "more", middle: " than you can", oval: "say" },
    heroSubtitle: "Short courses that turn what you know into what you can say.",
    ctaPrimary: "Start for free",
    catalogueLink: "All courses",
    bio: {
      name: "Alina.",
      text: "For 10+ years I’ve been helping adults speak English with confidence. I design brain-friendly courses.",
    },
    followLabel: "more on brains & language",
    instagram: "Instagram",
    youtube: "YouTube",
    comic: {
      head: "English in my head",
      speak: "English I speak",
      um: "uhh... um",
      sticker: { figure: "10–15", unit: "minutes a day" },
      note: "it’s normal: understanding and speaking are different skills",
    },
    catalogueEyebrow: "Catalogue",
    coursesHeading: "Courses",
    catalogueSubtitle: "About an hour per course — finish one in a week.",
    courses: { one: "course", other: "courses" },
    lessons: { one: "lesson", other: "lessons" },
    minutes: "min",
    empty: "Courses are coming soon — check back later.",
    stepsEyebrow: "How it works",
    stepsHeading: "Speak, hear back, compare",
    stepsSubtitle: "Voice tasks are part of cohort courses.",
    steps: [
      { title: "Record", text: "Answer a voice task out loud, right on your phone." },
      { title: "Get feedback", text: "The author listens and writes back to you." },
      { title: "Compare", text: "Record the same prompt again at the end and hear the difference." },
    ],
    closingTitle: "Your first lesson is one tap away",
    closingText: "No sign-up, no payment.",
  },
};

/**
 * The landing's headline as plain text and its subtitle, for places that
 * cannot draw the marker or the oval: the English surface's meta description
 * and its share cards (SHELL-032, docs/decisions/0168, replacing copy.ts's old
 * SHELL-010 headline). Russian, because a share card is cached per
 * URL and the metadata stays Russian (docs/handoff.md, "Audience and
 * language"). Spacing as `HeroTitle` renders it.
 */
export function landingShareText(lang: SurfaceLang = "ru"): { title: string; description: string } {
  const { heroTitle: h, heroSubtitle } = landingCopy[lang];
  return { title: `${h.lead} ${h.marker}${h.middle} ${h.oval}`, description: heroSubtitle };
}
