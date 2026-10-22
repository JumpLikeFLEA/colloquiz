/**
 * The voice task's strings (VOICE-003, VOICE-005; docs/decisions/0111).
 * English, like the rest of the lesson chrome (docs/decisions/0080
 * Decision 5). Kept out of lib/alliengll/copy.ts on purpose: copy.ts ships
 * with every lesson, and this module ships only in the voice block's own
 * chunk, which a lesson without a voice task never downloads.
 */
export const voiceCopy = {
  label: "Voice task",
  upTo: "Up to",
  tryToUse: "Try to use",
  record: "Record",
  stop: "Stop",
  recording: "Recording",
  recordAgain: "Record again",
  sendThisTake: "Send this take",
  take: "Take",
  takesLabel: "Your takes",
  deleteTake: "Delete",
  takesFull: "You have 5 takes. Delete one to record another.",
  takesNote: "Your takes stay on this device until you reload the page.",
  sending: "Sending",
  retry: "Try again",
  uploadFailed: "Sending failed. Check your connection and try again.",
  sent: "Sent. Waiting for feedback.",
  sentSelfPaced: "Sent.",
  capTask: "You've had AI feedback on 3 recordings of this task, which is the limit. Your last feedback stays on this page.",
  capDaily: "You've reached today's limit of AI feedback.",
  capDailyRetry: "You can send again after",
  capDailyLater: "Try again later.",
  capNotSent: "This recording was not sent.",
  resendNote: "Recording again and sending replaces the recording you sent.",
  feedbackHeading: "Feedback",
  locked: "Your recording has feedback, so it can't be replaced.",
  removed: "This recording was removed after the course ended.",
  practiceNote: "Practice only: your recording stays on this device and isn't sent.",
  refused: "This recording can't be sent from this account. You can still practise; it stays on this device.",
  lockedMeanwhile: "Feedback on your earlier recording has just been published. Reload the page to read it.",
  noContainer: "This browser recorded in a format that can't be sent. Try Chrome or Safari.",
  timeLimit: "Stopped at the time limit.",
  denied: "Microphone access is blocked. Allow it for this site in your browser settings, then try again.",
  micError: "The microphone couldn't be started. Check that one is connected, then try again.",
  unsupported: "Recording doesn't work in this browser. Open this page in Safari or Chrome.",
  copyLink: "Copy link",
  linkCopied: "Link copied",
  previewNote: "Learners record here on the lesson page.",
};
