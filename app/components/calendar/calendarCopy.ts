import type { CalendarLang } from "@/lib/calendar/labels";

// COH-015 — the calendar's strings, EN and RU, in one place. /my follows the
// saved EN/RU choice; Studio is always English (docs/decisions/0159). Kept out
// of lib/alliengll/copy.ts on purpose (docs/handoff.md, "Audience and
// language": keep copy.ts out of anything that renders on `/` or the course
// page). What an item is called lives in lib/calendar/labels.ts, because the
// .ics feed needs it too.

export { itemLabel, type CalendarLang } from "@/lib/calendar/labels";

type Copy = {
  prevMonth: string;
  nextMonth: string;
  today: string;
  empty: string;
  allDay: string;
  zone: (tz: string) => string;
  zoneUtcHint: string;
  doneMark: string;
  external: string;
  gridLabel: string;
  agendaLabel: string;
  /** The "Subscribe in your calendar" panel (COH-016, docs/decisions/0160). */
  feedTitle: string;
  feedLead: string;
  feedCreate: string;
  feedHasLink: (date: string | null) => string;
  feedReplace: string;
  feedReplaceConfirm: string;
  feedReplaceYes: string;
  feedCancel: string;
  feedTurnOff: string;
  feedIsOff: string;
  feedYourLink: string;
  feedCopy: string;
  feedCopied: string;
  feedPrivate: string;
  feedError: string;
};

export const calendarCopy: Record<CalendarLang, Copy> = {
  en: {
    prevMonth: "Previous month",
    nextMonth: "Next month",
    today: "Today",
    empty: "Nothing on the calendar this month.",
    allDay: "All day",
    zone: (tz) => `Times are shown in ${tz}.`,
    zoneUtcHint: "Your time zone isn't known yet, so times are shown in UTC.",
    doneMark: "done",
    external: "opens in a new tab",
    gridLabel: "Month calendar",
    agendaLabel: "Agenda",
    feedTitle: "Subscribe in your calendar",
    feedLead:
      "Show these dates in Google Calendar or Apple Calendar. You get a private link: paste it into your calendar app's \"add by URL\" option.",
    feedCreate: "Create link",
    feedHasLink: (date) =>
      `You made a link${date ? ` on ${date}` : ""}. It can't be shown again; replace it to get a new one.`,
    feedReplace: "Replace link",
    feedReplaceConfirm: "The old link will stop working in every calendar that uses it. Replace it?",
    feedReplaceYes: "Yes, replace",
    feedCancel: "Cancel",
    feedTurnOff: "Turn off",
    feedIsOff: "The feed is off. Create a link to turn it on again.",
    feedYourLink: "Your link",
    feedCopy: "Copy",
    feedCopied: "Copied",
    feedPrivate: "Anyone who has this link can read your dates, so don't share it. Copy it now: it can't be shown again.",
    feedError: "Something went wrong. Try again.",
  },
  ru: {
    prevMonth: "Предыдущий месяц",
    nextMonth: "Следующий месяц",
    today: "Сегодня",
    empty: "В этом месяце в календаре ничего нет.",
    allDay: "Весь день",
    zone: (tz) => `Время указано в часовом поясе ${tz}.`,
    zoneUtcHint: "Ваш часовой пояс пока не определён, поэтому время указано по UTC.",
    doneMark: "выполнено",
    external: "откроется в новой вкладке",
    gridLabel: "Календарь на месяц",
    agendaLabel: "Список событий",
    feedTitle: "Подписаться в своём календаре",
    feedLead:
      "Покажите эти даты в Google Календаре или Apple Календаре. Вы получите личную ссылку: вставьте её в пункт «добавить по URL» в приложении календаря.",
    feedCreate: "Создать ссылку",
    feedHasLink: (date) =>
      `Вы создали ссылку${date ? ` ${date}` : ""}. Показать её снова нельзя; чтобы получить новую, замените её.`,
    feedReplace: "Заменить ссылку",
    feedReplaceConfirm: "Старая ссылка перестанет работать во всех календарях, где она используется. Заменить?",
    feedReplaceYes: "Да, заменить",
    feedCancel: "Отмена",
    feedTurnOff: "Выключить",
    feedIsOff: "Подписка выключена. Создайте ссылку, чтобы включить её снова.",
    feedYourLink: "Ваша ссылка",
    feedCopy: "Копировать",
    feedCopied: "Скопировано",
    feedPrivate: "Любой, у кого есть эта ссылка, может прочитать ваши даты, поэтому никому её не передавайте. Скопируйте её сейчас: показать её снова нельзя.",
    feedError: "Что-то пошло не так. Попробуйте ещё раз.",
  },
};
