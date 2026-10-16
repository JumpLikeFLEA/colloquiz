import type { SurfaceLang } from "@/lib/alliengll/surfaceLang";
import type { ComposerLabels } from "@/app/components/messages/MessageComposer";
import type { AttachmentLabels } from "@/app/components/messages/AttachmentCard";

/**
 * The learner's messages pages' strings (TCH-004, docs/decisions/0151). Both
 * languages: like `/my`, these pages follow the saved EN/RU choice with no
 * toggle of their own (docs/decisions/0120). Imported only by Server
 * Components, which pass the composer its strings as props; keep it out of
 * Client Components (docs/decisions/0079, "Budget").
 *
 * New copy, pending owner/partner review.
 */
type MessagesStrings = {
  metaTitle: string;
  eyebrow: string;
  title: string;
  lead: string;
  backToMy: string;
  backToList: string;
  listEmpty: string;
  startConversation: string;
  openConversation: string;
  newCount: (n: number) => string;
  closedPill: string;
  noMessages: string;
  closedNote: (teacher: string) => string;
  privateNote: (teacher: string) => string;
  you: string;
  newMessage: string;
  unreadable: string;
  attachment: AttachmentLabels;
  attachmentUnreadable: string;
  composer: ComposerLabels;
};

export const messagesCopy: Record<SurfaceLang, MessagesStrings> = {
  ru: {
    metaTitle: "Сообщения",
    eyebrow: "Ваш аккаунт",
    title: "Сообщения",
    lead: "Пишите преподавателю, к которому вы подключены. Переписку видите только вы двое.",
    backToMy: "Мои курсы",
    backToList: "Все сообщения",
    listEmpty: "Вы пока не подключены ни к одному преподавателю. Когда подключитесь, сможете писать ему здесь.",
    startConversation: "Начать переписку",
    openConversation: "Открыть",
    newCount: (n) => `Новых: ${n}`,
    closedPill: "Закрыта",
    noMessages: "Пока нет сообщений. Напишите первое.",
    closedNote: (teacher) =>
      `Переписка закрыта: вы больше не подключены к ${teacher}. Её можно читать, но новые сообщения недоступны.`,
    privateNote: (teacher) => `Эту переписку видите только вы и ${teacher}.`,
    you: "Вы",
    newMessage: "Новое",
    unreadable: "Это сообщение не удаётся показать.",
    attachment: {
      exercise: "Задание",
      voiceTask: "Голосовое задание",
      answer: "Ответ",
      answerNotIncluded: "Ответ не приложен.",
      answerUnreadable: "Ответ не удаётся показать.",
      exerciseUnreadable: "Задание не удаётся показать.",
    },
    attachmentUnreadable: "Приложенное задание не удаётся показать.",
    composer: {
      label: "Ваше сообщение",
      bold: "Жирный",
      hint: "**жирный** · пустая строка = новый абзац",
      send: "Отправить",
      sending: "Отправляем…",
      counter: "{n} / {max}",
      failed: "Не удалось отправить. Попробуйте ещё раз.",
    },
  },
  en: {
    metaTitle: "Messages",
    eyebrow: "Your account",
    title: "Messages",
    lead: "Write to a teacher you are linked to. Only the two of you can read the conversation.",
    backToMy: "My courses",
    backToList: "All messages",
    listEmpty: "You aren’t linked to a teacher yet. Once you are, you can write to them here.",
    startConversation: "Start a conversation",
    openConversation: "Open",
    newCount: (n) => `${n} new`,
    closedPill: "Closed",
    noMessages: "No messages yet. Write the first one.",
    closedNote: (teacher) =>
      `This conversation is closed: you are no longer linked to ${teacher}. You can read it, but it takes no new messages.`,
    privateNote: (teacher) => `Only you and ${teacher} can read this conversation.`,
    you: "You",
    newMessage: "New",
    unreadable: "This message can’t be shown.",
    attachment: {
      exercise: "Exercise",
      voiceTask: "Voice task",
      answer: "Answer",
      answerNotIncluded: "Answer not included.",
      answerUnreadable: "The answer can’t be shown.",
      exerciseUnreadable: "The exercise can’t be shown.",
    },
    attachmentUnreadable: "The attached exercise can’t be shown.",
    composer: {
      label: "Your message",
      bold: "Bold",
      hint: "**bold** · blank line = new paragraph",
      send: "Send",
      sending: "Sending…",
      counter: "{n} / {max}",
      failed: "Could not send. Please try again.",
    },
  },
};
