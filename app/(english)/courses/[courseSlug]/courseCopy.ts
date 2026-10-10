import type { SurfaceLang } from "@/lib/alliengll/surfaceLang";
import type { PluralForms } from "@/lib/pluralCategory";

/**
 * The course page's chrome, in both languages (docs/decisions/0080: the
 * landing and the course pages share one EN/RU toggle). Moved out of
 * lib/alliengll/copy.ts, which no longer covers this page. Only chrome:
 * the course's title, description and lesson titles are authored content
 * and render as written.
 *
 * Imported only by Server Components (page.tsx, CourseHero,
 * LessonListItem), so neither language reaches the client bundle; keep it
 * out of Client Components on this route (docs/decisions/0079, "Budget").
 *
 * The Russian strings are the 0079 course-page copy, unchanged; the English
 * ones are new. Both are pending owner/partner review.
 */
type CourseStrings = {
  languageGroupLabel: string;
  backToCatalogue: string;
  startFirstFree: string;
  startCourse: string;
  allFree: string;
  progressAttempted: string;
  progressAverage: string;
  progressOf: string;
  lessons: PluralForms;
  exercises: PluralForms;
  minutesLabel: string;
  freeBadge: string;
  bestScoreLabel: string;
  aboutTitle: string;
  lessonsEyebrow: string;
  lessonsTitle: string;
  noFreeLesson: string;
  noLessons: string;
  // COH-004 (docs/decisions/0108): a cohort course.
  /** Followed by the week number. */
  week: string;
  /** The group of a cohort course's lessons that have no week. */
  openLessonsGroup: string;
  /** Followed by the unlock moment in the viewer's local time. */
  opensOn: string;
  callsEyebrow: string;
  callsTitle: string;
  callsEmpty: string;
  callsJoin: string;
  callsPast: string;
  cohortEyebrow: string;
  cohortTitle: string;
  cohortIntro: string;
  /** Followed by the next run's start in the viewer's local time. */
  nextRun: string;
  noUpcomingRun: string;
  tiersTitle: string;
  tierBasic: string;
  tierBasicDesc: string;
  tierExtended: string;
  tierExtendedDesc: string;
  howToJoin: string;
};

export const courseCopy: Record<SurfaceLang, CourseStrings> = {
  ru: {
    languageGroupLabel: "Язык",
    backToCatalogue: "Все курсы",
    startFirstFree: "Начать первый бесплатный урок",
    startCourse: "Начать курс",
    allFree: "Весь курс бесплатно",
    progressAttempted: "пройдено уроков",
    progressAverage: "средний результат",
    progressOf: "из",
    lessons: { one: "урок", few: "урока", many: "уроков", other: "урока" },
    exercises: { one: "задание", few: "задания", many: "заданий", other: "задания" },
    minutesLabel: "мин",
    freeBadge: "Бесплатно",
    bestScoreLabel: "Лучший",
    aboutTitle: "О курсе",
    lessonsEyebrow: "Программа",
    lessonsTitle: "Уроки курса",
    noFreeLesson: "Скоро появятся бесплатные уроки",
    noLessons: "Уроки скоро появятся — загляните позже.",
    week: "Неделя",
    openLessonsGroup: "Открытые уроки",
    opensOn: "Откроется",
    callsEyebrow: "Расширенный тариф",
    callsTitle: "Созвоны",
    callsEmpty: "Созвоны пока не назначены.",
    callsJoin: "Подключиться",
    callsPast: "Прошедшие созвоны",
    cohortEyebrow: "Курс с группой",
    cohortTitle: "Как проходит курс",
    cohortIntro: "Курс идёт с группой: уроки открываются по неделям, начиная с даты старта.",
    nextRun: "Ближайший старт:",
    noUpcomingRun: "Дата следующего старта пока не объявлена.",
    tiersTitle: "Тарифы",
    tierBasic: "Базовый",
    tierBasicDesc: "Уроки по неделям и голосовые задания с письменной обратной связью.",
    tierExtended: "Расширенный",
    tierExtendedDesc: "Всё из базового и еженедельный созвон.",
    howToJoin: "Как присоединиться",
  },
  en: {
    languageGroupLabel: "Language",
    backToCatalogue: "All courses",
    startFirstFree: "Start the first free lesson",
    startCourse: "Start the course",
    allFree: "Whole course free",
    progressAttempted: "lessons attempted",
    progressAverage: "average score",
    progressOf: "of",
    lessons: { one: "lesson", other: "lessons" },
    exercises: { one: "exercise", other: "exercises" },
    minutesLabel: "min",
    freeBadge: "Free",
    bestScoreLabel: "Best",
    aboutTitle: "About the course",
    lessonsEyebrow: "Syllabus",
    lessonsTitle: "Lessons",
    noFreeLesson: "Free lessons are coming soon",
    noLessons: "Lessons are coming soon — check back later.",
    week: "Week",
    openLessonsGroup: "Open lessons",
    opensOn: "Opens",
    callsEyebrow: "Extended tier",
    callsTitle: "Calls",
    callsEmpty: "No calls scheduled yet.",
    callsJoin: "Join",
    callsPast: "Past calls",
    cohortEyebrow: "Cohort course",
    cohortTitle: "How the course runs",
    cohortIntro: "The course runs with a group: lessons open week by week from the start date.",
    nextRun: "Next start:",
    noUpcomingRun: "The next start date hasn’t been announced yet.",
    tiersTitle: "Tiers",
    tierBasic: "Basic",
    tierBasicDesc: "Weekly lessons and voice tasks with written feedback.",
    tierExtended: "Extended",
    tierExtendedDesc: "Everything in Basic, plus a weekly call.",
    howToJoin: "How to join",
  },
};
