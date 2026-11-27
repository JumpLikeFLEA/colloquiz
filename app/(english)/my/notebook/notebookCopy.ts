import type { SurfaceLang } from "@/lib/alliengll/surfaceLang";
import type { NotebookTab } from "@/lib/notebook/tabs";

/**
 * The notebook's strings (PROG-014, docs/decisions/0240). Both languages: like `/my`, the page
 * follows the saved EN/RU choice with no toggle of its own (docs/decisions/0120). Imported only by
 * Server Components; keep it out of Client Components (docs/decisions/0079, "Budget"). The AI
 * disclaimer and the recording kinds are `/my`'s own strings (myCopy), not repeated here.
 *
 * New copy, pending owner/partner review.
 */
type NotebookStrings = {
  metaTitle: string;
  eyebrow: string;
  title: string;
  lead: string;
  summaryTitle: string;
  goal: string;
  nextStep: string;
  noFollow: string;
  recordLabel: string;
  lessonsCompleted: string;
  recordingsSent: string;
  phrasesSaid: string;
  notesSaved: string;
  coursesLabel: string;
  allCourses: string;
  untitledCourse: string;
  tabsLabel: string;
  tabs: Record<NotebookTab, string>;
  saidIcon: string;
  ownIcon: string;
  youSaid: string;
  close: string;
  better: string;
  emptyTab: Record<NotebookTab, string>;
  emptyCourse: string;
  emptyTitle: string;
  emptyBody: string;
  chooseCourse: string;
  recordingsTitle: string;
  recording: string;
  keptUntil: string;
  deletedSoon: string;
  audioDeleted: string;
  audioDeletedNotesKept: string;
  listen: string;
  /** PROG-019 (0243). */
  download: string;
  /** "{format}" is WEBM, OGG or M4A. */
  fileFormat: string;
  unknownFormat: string;
  downloadNotebook: string;
};

export const notebookCopy: Record<SurfaceLang, NotebookStrings> = {
  ru: {
    metaTitle: "Блокнот",
    eyebrow: "Ваш аккаунт",
    title: "Блокнот",
    lead: "Что вы уже говорите по-английски и что сохранили.",
    summaryTitle: "Последний разбор",
    goal: "Цель",
    nextStep: "Следующий шаг",
    noFollow: "У этой записи нет цели или следующего шага.",
    recordLabel: "Ваши итоги",
    lessonsCompleted: "пройдено уроков",
    recordingsSent: "отправлено записей",
    phrasesSaid: "сказано фраз",
    notesSaved: "сохранено заметок",
    coursesLabel: "Курс",
    allCourses: "Все курсы",
    untitledCourse: "Курс",
    tabsLabel: "Разделы блокнота",
    tabs: { phrases: "Фразы", fixes: "Исправления", "to-try": "Попробовать" },
    saidIcon: "Сказано вслух",
    ownIcon: "Ваша заметка",
    youSaid: "Вы сказали",
    close: "почти так",
    better: "Лучше",
    emptyTab: {
      phrases: "Фраз пока нет. Они появятся здесь после разбора вашей записи.",
      fixes: "Исправлений пока нет. Они появятся здесь после разбора вашей записи.",
      "to-try": "Сейчас здесь нет фраз.",
    },
    emptyCourse: "В этом курсе здесь пока ничего нет.",
    emptyTitle: "Блокнот пока пуст",
    emptyBody: "Пройдите урок и запишите голосовое задание: фразы, которые вы скажете, и их разбор сохранятся здесь.",
    chooseCourse: "Выбрать курс",
    recordingsTitle: "Записи",
    recording: "Запись",
    keptUntil: "Хранится до",
    deletedSoon: "Аудио скоро будет удалено",
    audioDeleted: "Аудио удалено",
    audioDeletedNotesKept: "Аудио удалено, заметки сохранены",
    listen: "Послушать в уроке",
    download: "Скачать",
    fileFormat: "файл {format}",
    unknownFormat: "аудиофайл",
    downloadNotebook: "Скачать блокнот (.txt)",
  },
  en: {
    metaTitle: "Notebook",
    eyebrow: "Your account",
    title: "Notebook",
    lead: "What you can already say in English, and what you have saved.",
    summaryTitle: "Latest summary",
    goal: "Goal",
    nextStep: "Next step",
    noFollow: "This recording has no goal or next step.",
    recordLabel: "Your record",
    lessonsCompleted: "lessons completed",
    recordingsSent: "recordings sent",
    phrasesSaid: "phrases said",
    notesSaved: "notes saved",
    coursesLabel: "Course",
    allCourses: "All courses",
    untitledCourse: "Course",
    tabsLabel: "Notebook sections",
    tabs: { phrases: "Phrases", fixes: "Fixes", "to-try": "To try" },
    saidIcon: "Said out loud",
    ownIcon: "Your note",
    youSaid: "You said",
    close: "close",
    better: "Better",
    emptyTab: {
      phrases: "No phrases yet. They appear here after feedback on your recording.",
      fixes: "No fixes yet. They appear here after feedback on your recording.",
      "to-try": "No phrases here right now.",
    },
    emptyCourse: "Nothing here from this course yet.",
    emptyTitle: "Your notebook is empty",
    emptyBody: "Take a lesson and record its voice task: the phrases you say and the feedback on them are kept here.",
    chooseCourse: "Choose a course",
    recordingsTitle: "Recordings",
    recording: "Recording",
    keptUntil: "Kept until",
    deletedSoon: "The audio will be deleted soon",
    audioDeleted: "Audio deleted",
    audioDeletedNotesKept: "Audio deleted, notes kept",
    listen: "Listen in the lesson",
    download: "Download",
    fileFormat: "{format} file",
    unknownFormat: "audio file",
    downloadNotebook: "Download notebook (.txt)",
  },
};
