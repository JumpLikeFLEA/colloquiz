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
 * figures that nothing measures (docs/decisions/0078).
 */

import type { SurfaceLang } from "@/lib/alliengll/surfaceLang";
import type { PluralForms } from "@/lib/pluralCategory";

/**
 * The hero mini-demo's item: `i2` from the `exit-check` lesson of
 * authored/courses/future-imperfect.json, copied here as marketing copy —
 * nothing reads the authored file at runtime (docs/handoff.md, "PDF treated
 * as the source of truth"). Language-neutral: it is an English exercise in
 * both locales; only its feedback strings are translated below.
 */
export const heroDemoItem = {
  prompt: "Humans ___ on the Moon since 1969.",
  options: [
    { id: "a", text: "walked" },
    { id: "b", text: "have walked" },
    { id: "c", text: "are walking" },
  ],
  correctOptionId: "b",
} as const;

type LandingStrings = {
  wordmark: string;
  login: string;
  languageGroupLabel: string;
  heroEyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
  ctaPrimary: string;
  noAccount: string;
  catalogueLink: string;
  demo: {
    label: string;
    hint: string;
    correct: string;
    wrong: string;
    why: string;
    retry: string;
    source: string;
  };
  values: { title: string; text: string }[];
  catalogueEyebrow: string;
  coursesHeading: string;
  catalogueSubtitle: string;
  courses: PluralForms;
  lessons: PluralForms;
  minutes: string;
  empty: string;
  stepsEyebrow: string;
  stepsHeading: string;
  steps: { title: string; text: string }[];
  closingTitle: string;
  closingText: string;
};

export const landingCopy: Record<SurfaceLang, LandingStrings> = {
  ru: {
    wordmark: "Alliengll",
    login: "Войти",
    languageGroupLabel: "Язык",
    heroEyebrow: "Мини-курсы английского · A2–B2",
    heroTitle: "Английский без напряжения",
    heroSubtitle:
      "Короткие курсы для тех, кто хочет понимать и говорить по-английски — на телефоне, в удобном темпе.",
    ctaPrimary: "Начать бесплатно",
    noAccount: "Для бесплатных уроков регистрация не нужна.",
    catalogueLink: "Все курсы",
    demo: {
      label: "Попробуйте прямо сейчас",
      hint: "Выберите вариант",
      correct: "Верно!",
      wrong: "Не совсем.",
      why: "«Since 1969» — мост из прошлого в настоящее, поэтому нужен present perfect: have walked.",
      retry: "Ещё раз",
      source: "Задание из курса «Future Imperfect»",
    },
    values: [
      { title: "10–15 минут", text: "Один урок помещается в перерыв." },
      { title: "Уровни A2–B2", text: "Для тех, кто уже знает основы." },
      { title: "Первые уроки бесплатно", text: "Без регистрации — просто начните." },
      { title: "Разбор каждой ошибки", text: "Объясняем, почему ответ верный или нет." },
    ],
    catalogueEyebrow: "Каталог",
    coursesHeading: "Курсы",
    catalogueSubtitle: "Около часа на курс — его можно пройти за неделю.",
    courses: { one: "курс", few: "курса", many: "курсов", other: "курса" },
    lessons: { one: "урок", few: "урока", many: "уроков", other: "урока" },
    minutes: "мин",
    empty: "Курсы скоро появятся — загляните позже.",
    stepsEyebrow: "Как это устроено",
    stepsHeading: "Три шага до первого урока",
    steps: [
      { title: "Выберите курс", text: "Грамматика, слова, фразы — короткие темы, а не учебник целиком." },
      { title: "Пройдите урок с телефона", text: "Немного теории, потом задания — и так несколько раз." },
      { title: "Разберите ошибки", text: "У каждого ответа есть объяснение. Результат — в процентах, без «провалов»." },
    ],
    closingTitle: "Первый урок — в одно касание",
    closingText: "Без регистрации и без оплаты.",
  },
  en: {
    wordmark: "Alliengll",
    login: "Log in",
    languageGroupLabel: "Language",
    heroEyebrow: "English mini-courses · A2–B2",
    heroTitle: "English without the stress",
    heroSubtitle: "Short courses for A2–B2 learners. Study on your phone, at your own pace.",
    ctaPrimary: "Start for free",
    noAccount: "Free lessons don’t need an account.",
    catalogueLink: "All courses",
    demo: {
      label: "Try it right now",
      hint: "Pick an option",
      correct: "Correct!",
      wrong: "Not quite.",
      why: "“Since 1969” is a bridge from the past to now, so it takes the present perfect: have walked.",
      retry: "Try again",
      source: "From the course “Future Imperfect”",
    },
    values: [
      { title: "10–15 minutes", text: "A lesson fits into a coffee break." },
      { title: "Levels A2–B2", text: "For learners who know the basics." },
      { title: "First lessons free", text: "No sign-up — just start." },
      { title: "Every mistake explained", text: "See why each answer is right or wrong." },
    ],
    catalogueEyebrow: "Catalogue",
    coursesHeading: "Courses",
    catalogueSubtitle: "About an hour per course — finish one in a week.",
    courses: { one: "course", other: "courses" },
    lessons: { one: "lesson", other: "lessons" },
    minutes: "min",
    empty: "Courses are coming soon — check back later.",
    stepsEyebrow: "How it works",
    stepsHeading: "Three steps to your first lesson",
    steps: [
      { title: "Pick a course", text: "Grammar, vocabulary, phrases — short topics, not a whole textbook." },
      { title: "Play a lesson on your phone", text: "A bit of theory, then exercises — repeated a few times." },
      { title: "Learn from mistakes", text: "Every answer comes with an explanation. Your score is a percentage — no fails." },
    ],
    closingTitle: "Your first lesson is one tap away",
    closingText: "No sign-up, no payment.",
  },
};
