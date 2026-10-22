/**
 * The AI voice feedback view's strings (VOICE-014, docs/decisions/0189). English, like the
 * rest of the lesson chrome (docs/decisions/0080 Decision 5) and like the analysis itself
 * (0156 Decision 5). Kept beside voiceCopy.ts and for the same reason: this module ships only
 * in the feedback view's own chunk, and a lesson without a voice task, or with the analysis
 * switched off, never downloads it.
 */
export const voiceAnalysisCopy = {
  label: "AI feedback",
  disclaimer: "Made automatically from a transcript of your recording. It can be wrong. It is not a grade.",

  // In progress
  pending: "Getting your recording ready…",
  transcribing: "Listening to your recording…",
  analysing: "Reading what you said…",
  stalled: "This is taking longer than usual. Come back to this page in a few minutes: the feedback will be here.",
  loadFailed: "Couldn't check for your feedback. Trying again…",

  // States with no feedback to show
  failedTitle: "We couldn't make feedback for this recording",
  failedBody: "It doesn't count towards your limit. Record again and send it to try once more.",
  withdrawnTitle: "Feedback withdrawn — send again",
  withdrawnBody: "The author took this feedback down because it may have been wrong. Record again and send it to get new feedback.",
  pausedTitle: "AI feedback is paused",
  pausedBody: "Your recording is saved, but it has no AI feedback. Record again and send it when feedback is back.",
  limit: "AI limit reached; your teacher will still answer.",

  limitSelf: "This recording has no AI feedback: you've reached the limit for this task.",

  // Result
  whatWorked: "What worked",
  yourWords: "Your words",
  tapHint: "Tap a marked phrase to see why.",
  legend: "Key",
  expressionsHeading: "Expressions from the lesson",
  expressionExact: "used",
  expressionClose: "close",
  notUsedYet: "Not used yet:",
  mainErrorHeading: "One thing to fix",
  youSaid: "You said",
  better: "Better",
  allErrors: "All errors",
  howItSounds: "How it sounds",
  goalHeading: "Your goal for next time",
  goalReachedHeading: "Your goal from the first recording",
  thenNowHeading: "Then and now",
  then: "Then",
  now: "Now",
  nextStepHeading: "Next step",
  day1: "Day 1 feedback",
  was: "was",
  truncated: "This feedback covers the first 3 minutes of your recording.",
} as const;
