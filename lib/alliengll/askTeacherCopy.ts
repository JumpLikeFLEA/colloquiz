/**
 * "Ask the teacher" strings (TCH-006, docs/decisions/0153). English, like the
 * rest of the lesson chrome (docs/decisions/0080 Decision 5). Kept out of
 * lib/alliengll/copy.ts on purpose: copy.ts ships with every lesson, and this
 * module ships only in the Ask chunk, which a visitor who is not linked to a
 * teacher never downloads (the voiceCopy precedent, 0111).
 */
export const askTeacherCopy = {
  link: "Ask the teacher",
  title: "Ask the teacher",
  description: "Your teacher gets a copy of this exercise as it is now, with your question.",
  to: "To",
  previewLabel: "What your teacher will see",
  includeAnswer: "Include my answer",
  answerNotChecked: "Check your answer first if you want to include it.",
  composer: {
    label: "Your question",
    bold: "Bold",
    hint: "**bold** · blank line = new paragraph",
    send: "Send",
    sending: "Sending…",
    counter: "{n} / {max}",
    failed: "Could not send. Please try again.",
  },
  sentTitle: "Sent",
  sentBody: "Your teacher will reply in your messages.",
  openMessages: "Open the conversation",
  close: "Close",
  cantBuild: "This exercise can't be attached.",
} as const;

/** The labels the read-only exercise card needs, in English (the lesson
 * dialog's preview and Studio's thread). */
export const attachmentLabelsEn = {
  exercise: "Exercise",
  voiceTask: "Voice task",
  answer: "Answer",
  answerNotIncluded: "Answer not included.",
  answerUnreadable: "The answer can't be shown.",
  exerciseUnreadable: "The exercise can't be shown.",
  unreadableAttachment: "The attached exercise can't be shown.",
} as const;
