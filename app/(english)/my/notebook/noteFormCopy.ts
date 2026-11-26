import type { SurfaceLang } from "@/lib/alliengll/surfaceLang";
import type { NoteError } from "@/lib/notebook/noteForm";

/**
 * The notebook's write side (PROG-016, docs/decisions/0241), EN/RU with the saved choice. The page
 * passes ONE language's object to the client components as a prop, so the other language never
 * ships (the notebookCopy rule, 0079 "Budget"). The confirmations are built here on the server,
 * because each names what goes.
 *
 * New copy, pending owner/partner review.
 */
export type NoteFormStrings = {
  addTitle: string;
  addLead: string;
  phraseLabel: string;
  phraseHint: string;
  noteLabel: string;
  noteHint: string;
  save: string;
  saving: string;
  cancel: string;
  edit: string;
  delete: string;
  deleting: string;
  confirmYes: string;
  errors: Record<NoteError, string>;
  deleteFailed: string;
};

type Confirm = { title: string; body: string };

type ConfirmStrings = {
  own: (phrase: string) => Confirm;
  said: (phrase: string, takes: number) => Confirm;
  fix: (quote: string, correction: string) => Confirm;
  summary: () => Confirm;
};

export const noteFormCopy: Record<SurfaceLang, NoteFormStrings & { confirm: ConfirmStrings }> = {
  ru: {
    addTitle: "Добавить фразу",
    addLead: "Фраза, которую хотите запомнить, и заметка к ней. Ваши заметки видите только вы.",
    phraseLabel: "Фраза",
    phraseHint: "До 200 символов.",
    noteLabel: "Заметка (необязательно)",
    noteHint: "До 500 символов. В блокноте может быть до 1000 ваших заметок.",
    save: "Сохранить",
    saving: "Сохраняем…",
    cancel: "Отмена",
    edit: "Изменить",
    delete: "Удалить",
    deleting: "Удаляем…",
    confirmYes: "Да, удалить",
    errors: {
      phrase_empty: "Напишите фразу.",
      phrase_too_long: "Фраза длиннее 200 символов.",
      note_too_long: "Заметка длиннее 500 символов.",
      note_cap: "У вас 1000 заметок — это предел. Удалите одну, чтобы добавить новую.",
      not_found: "Этой заметки больше нет в блокноте.",
      unauthenticated: "Сессия закончилась. Войдите снова.",
      failed: "Не удалось сохранить. Попробуйте ещё раз.",
    },
    deleteFailed: "Не удалось удалить. Попробуйте ещё раз.",
    confirm: {
      own: (phrase) => ({ title: `Удалить заметку «${phrase}»?`, body: "Фраза и заметка к ней удалятся. Это нельзя отменить." }),
      said: (phrase, takes) => ({
        title: `Удалить «${phrase}»?`,
        body: `${takes > 1 ? `Фраза удалится из всех ${takes} записей этого курса, где вы её сказали.` : "Фраза удалится из блокнота."} Разбор в уроке останется. Если фраза есть в списке урока, она снова появится в «Попробовать». Это нельзя отменить.`,
      }),
      fix: (quote, correction) => ({
        title: "Удалить это исправление?",
        body: `«${quote}» → «${correction}». Разбор в уроке останется. Это нельзя отменить.`,
      }),
      summary: () => ({
        title: "Удалить этот разбор из блокнота?",
        body: "Здесь появится предыдущий. Запись и разбор в уроке останутся. Это нельзя отменить.",
      }),
    },
  },
  en: {
    addTitle: "Add a phrase",
    addLead: "A phrase you want to keep, with a note if you like. Only you see your notes.",
    phraseLabel: "Phrase",
    phraseHint: "Up to 200 characters.",
    noteLabel: "Note (optional)",
    noteHint: "Up to 500 characters. Your notebook holds up to 1,000 of your notes.",
    save: "Save",
    saving: "Saving…",
    cancel: "Cancel",
    edit: "Edit",
    delete: "Delete",
    deleting: "Deleting…",
    confirmYes: "Yes, delete",
    errors: {
      phrase_empty: "Write a phrase.",
      phrase_too_long: "The phrase is longer than 200 characters.",
      note_too_long: "The note is longer than 500 characters.",
      note_cap: "You have 1,000 notes, which is the limit. Delete one to add another.",
      not_found: "This note is no longer in your notebook.",
      unauthenticated: "Your session has ended. Sign in again.",
      failed: "Couldn't save. Try again.",
    },
    deleteFailed: "Couldn't delete. Try again.",
    confirm: {
      own: (phrase) => ({ title: `Delete your note "${phrase}"?`, body: "The phrase and its note go. This can't be undone." }),
      said: (phrase, takes) => ({
        title: `Delete "${phrase}"?`,
        body: `${takes > 1 ? `It goes from all ${takes} recordings in this course where you said it.` : "It goes from your notebook."} The feedback in the lesson stays. If a lesson lists it, it shows in To try again. This can't be undone.`,
      }),
      fix: (quote, correction) => ({
        title: "Delete this fix?",
        body: `"${quote}" → "${correction}". The feedback in the lesson stays. This can't be undone.`,
      }),
      summary: () => ({
        title: "Delete this summary from your notebook?",
        body: "The one before it shows here instead. The recording and its feedback in the lesson stay. This can't be undone.",
      }),
    },
  },
};
