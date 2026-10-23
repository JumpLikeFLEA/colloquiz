// COH-010 (docs/decisions/0173) — the reminder panel's strings. Imported by SERVER
// pages only, which pass the one language's object to the client panel as a prop,
// so the other language and this module never reach the browser. Wording pending
// partner review.

export type TelegramLang = "ru" | "en";

export type TelegramPanelCopy = {
  title: string;
  leadOff: string;
  leadOn: string;
  get: string;
  open: string;
  pendingHint: string;
  check: string;
  turnOff: string;
  isOff: string;
  error: string;
};

export const telegramPanelCopy: Record<TelegramLang, TelegramPanelCopy> = {
  ru: {
    title: "Напоминания в Telegram",
    leadOff:
      "Бот напишет, когда откроется новая неделя курса, придёт отзыв на вашу запись или итоговый комментарий, а на расширенном тарифе — когда скоро созвон. Если преподаватель задаст домашнее задание, бот напишет об этом и накануне срока. Он запомнит язык сайта и ваш часовой пояс.",
    leadOn: "Напоминания включены: бот пишет вам в Telegram. Отключить можно здесь или командой /stop в боте.",
    get: "Получать напоминания в Telegram",
    open: "Открыть Telegram",
    pendingHint: "Нажмите Start в боте. Ссылка действует час. Потом вернитесь сюда и нажмите «Проверить».",
    check: "Проверить",
    turnOff: "Отключить",
    isOff: "Напоминания отключены.",
    error: "Не получилось. Попробуйте ещё раз.",
  },
  en: {
    title: "Reminders in Telegram",
    leadOff:
      "The bot will message you when a new week of the course opens, when feedback on a recording or a final comment arrives, and, on the extended tier, before a call. If a teacher assigns you homework, it messages you then and the day before it is due. It saves the site's language and your time zone.",
    leadOn: "Reminders are on: the bot messages you in Telegram. Turn them off here, or with /stop in the bot.",
    get: "Get reminders in Telegram",
    open: "Open Telegram",
    pendingHint: "Press Start in the bot. The link works for one hour. Then come back here and press “Check”.",
    check: "Check",
    turnOff: "Turn off",
    isOff: "Reminders are off.",
    error: "Something went wrong. Try again.",
  },
};

// TCH-012 (docs/decisions/0177) — the same panel in Studio, for a teacher: English,
// like the rest of Studio's chrome. The link is the one a learner makes (090).
export const studioTelegramCopy: TelegramPanelCopy = {
  title: "Messages in Telegram",
  leadOff:
    "The bot will message you when a student writes to you in the app, with a link to the conversation. It sends at most one message an hour per student while theirs stays unread. It saves your time zone.",
  leadOn: "Messages are on: the bot pings you in Telegram when a student writes. Turn them off here, or with /stop in the bot.",
  get: "Get messages in Telegram",
  open: "Open Telegram",
  pendingHint: "Press Start in the bot. The link works for one hour. Then come back here and press “Check”.",
  check: "Check",
  turnOff: "Turn off",
  isOff: "Messages in Telegram are off.",
  error: "Something went wrong. Try again.",
};
