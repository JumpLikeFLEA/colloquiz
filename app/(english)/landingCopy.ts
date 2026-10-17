/**
 * Landing-page bilingual strings (docs/handoff.md, "Audience and language",
 * 2026-09-28 landing exception; the toggle is shared with the course pages
 * since docs/decisions/0080, whose own strings live in
 * courses/[courseSlug]/courseCopy.ts). Deliberately separate from
 * lib/alliengll/copy.ts — do not merge them, and do not import this file
 * outside app/(english)/page.tsx and its landing components.
 *
 * Every claim below is one docs/handoff.md already makes about the product
 * (lesson length, levels, free first lessons, explanations, ~1 hour per
 * course, a percentage rather than pass/fail) — no learner counts or other
 * figures that nothing measures (docs/decisions/0078). The Alina Cher copy
 * (the hero split, the comic panel, the bio, the voice-task steps) is new in
 * SHELL-027 and pending the owner's review (docs/decisions/0165).
 */

import type { SurfaceLang } from "@/lib/alliengll/surfaceLang";
import type { PluralForms } from "@/lib/pluralCategory";

/**
 * The brand tagline, "английский с умом" (docs/decisions/0156 Decision 11).
 * Russian in both locales, as in the owner's English mockup; `mark` is the
 * word group the hand-drawn oval goes around.
 */
export const TAGLINE = { lead: "английский", mark: "с умом" } as const;

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
  heroEyebrow: string;
  /** The headline is `heroTitleLead` plain, then `heroTitleMark` on the marker. */
  heroTitleLead: string;
  heroTitleMark: string;
  heroSubtitle: string;
  ctaPrimary: string;
  noAccount: string;
  catalogueLink: string;
  bio: string;
  followLabel: string;
  instagram: string;
  youtube: string;
  comic: { head: string; speak: string; um: string; sticker: string };
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
    heroEyebrow: "Мини-курсы английского · A2–B2",
    heroTitleLead: "Английский",
    heroTitleMark: "без напряжения",
    heroSubtitle:
      "Короткие курсы для тех, кто хочет понимать и говорить по-английски — на телефоне, в удобном темпе.",
    ctaPrimary: "Начать бесплатно",
    noAccount: "Для бесплатных уроков регистрация не нужна.",
    catalogueLink: "Все курсы",
    bio: "Курсы делает Алина",
    followLabel: "Алина в соцсетях",
    instagram: "Instagram",
    youtube: "YouTube",
    comic: {
      head: "английский в моей голове",
      speak: "английский, когда говорю",
      um: "ээ...мм",
      sticker: "10–15 минут в день",
    },
    catalogueEyebrow: "Каталог",
    coursesHeading: "Курсы",
    catalogueSubtitle: "Около часа на курс — его можно пройти за неделю.",
    courses: { one: "курс", few: "курса", many: "курсов", other: "курса" },
    lessons: { one: "урок", few: "урока", many: "уроков", other: "урока" },
    minutes: "мин",
    empty: "Курсы скоро появятся — загляните позже.",
    stepsEyebrow: "Как это устроено",
    stepsHeading: "Скажите, услышьте, сравните",
    stepsSubtitle: "Голосовые задания есть в курсах с потоком.",
    steps: [
      { title: "Запишите голос", text: "Ответьте на голосовое задание вслух, прямо с телефона." },
      { title: "Получите отклик", text: "Автор послушает вашу запись и ответит письменно." },
      { title: "Сравните", text: "В конце запишите тот же ответ ещё раз и услышьте разницу." },
    ],
    closingTitle: "Первый урок — в одно касание",
    closingText: "Без регистрации и без оплаты.",
  },
  en: {
    wordmark: "Alina Cher",
    login: "Log in",
    navCourses: "Courses",
    languageGroupLabel: "Language",
    heroEyebrow: "English mini-courses · A2–B2",
    heroTitleLead: "English",
    heroTitleMark: "without the stress",
    heroSubtitle: "Short courses for A2–B2 learners. Study on your phone, at your own pace.",
    ctaPrimary: "Start for free",
    noAccount: "Free lessons don’t need an account.",
    catalogueLink: "All courses",
    bio: "Courses made by Alina",
    followLabel: "Alina on social media",
    instagram: "Instagram",
    youtube: "YouTube",
    comic: {
      head: "English in my head",
      speak: "English I speak",
      um: "uhh… um",
      sticker: "10–15 minutes a day",
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
